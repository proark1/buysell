import type { PrismaClient } from '@prisma/client';
import type { AmazonMatchInput, EbayCandidateInput, ProductOpportunity } from '../domain/products.js';
import { findAmazonMatches } from '../clients/keepaClient.js';
import { searchEbayCandidates } from '../clients/serpApiClient.js';
import { calculateProfit } from './profitCalculator.js';
import { decideOpportunity } from './opportunityDecider.js';
import {
  evaluateAmazonProductSafety,
  evaluateProductSafety,
  getAmazonDiscoveryCategory,
  getAmazonDiscoveryProfile,
  type SafetyPolicy
} from './discoveryPolicy.js';
import { scoreAmazonDiscoveryCandidate, type AmazonDiscoveryScore } from './amazonDiscoveryScorer.js';
import { scoreAmazonMatch } from './matchScorer.js';
import { scoreOpportunity } from './opportunityScorer.js';
import type { ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { persistOpportunity } from '../repositories/opportunityRepository.js';

export interface AmazonDiscoveryCandidateResult {
  amazon: AmazonMatchInput;
  score: AmazonDiscoveryScore;
  safety: {
    status: 'PASS' | 'WARN' | 'REJECT';
    riskFlags: string[];
    reasons: string[];
  };
  rejectionReasons: string[];
}

export interface AmazonDiscoveryRunOptions {
  keepaApiKey: string;
  ruleConfig: ActiveRuleConfig;
  profileKey?: string;
  categoryKey?: string;
  query?: string;
  limit?: number;
  mode?: 'MANUAL' | 'AUTO';
  safeMode?: boolean;
  minimumAmazonScore?: number;
  maxAmazonCostUsd?: number;
  minPriceDropPercent?: number;
}

export interface CompareAmazonCandidatesOptions {
  db: PrismaClient;
  serpApiKey: string;
  ruleConfig: ActiveRuleConfig;
  runId?: string;
  candidateIds?: string[];
  limit?: number;
}

const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);
const decimal = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(3);
const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber();
  return undefined;
};

function amazonFromRecord(record: Record<string, unknown>): AmazonMatchInput {
  return {
    asin: String(record.asin),
    title: String(record.title),
    url: typeof record.amazonUrl === 'string' ? record.amazonUrl : undefined,
    brand: typeof record.brand === 'string' ? record.brand : undefined,
    currentPrice: numberValue(record.currentPrice),
    buyBoxPrice: numberValue(record.buyBoxPrice),
    avg90Price: numberValue(record.avg90Price),
    priceDropPercent: numberValue(record.priceDropPercent),
    availabilityStatus: typeof record.availabilityStatus === 'string' ? record.availabilityStatus : undefined,
    salesRank: numberValue(record.salesRank),
    rating: numberValue(record.rating),
    reviewCount: numberValue(record.reviewCount),
    rootCategory: typeof record.rootCategory === 'string' ? record.rootCategory : undefined,
    categoryTree: Array.isArray(record.categoryTree) ? record.categoryTree.filter((item): item is string => typeof item === 'string') : undefined,
    matchConfidence: 0,
    raw: record.rawKeepaJson
  };
}

function safetyPolicy(ruleConfig: ActiveRuleConfig, safeMode: boolean, maxAmazonCostUsd: number): SafetyPolicy {
  return {
    safeMode,
    blockedBrands: ruleConfig.blockedBrands,
    blockedCategories: ruleConfig.blockedCategories,
    blockedKeywords: ruleConfig.blockedKeywords,
    allowedCategories: ruleConfig.allowedCategories,
    maxAmazonCostUsd
  };
}

function amazonRejectionReasons(candidate: Omit<AmazonDiscoveryCandidateResult, 'rejectionReasons'>, minimumAmazonScore: number): string[] {
  const reasons: string[] = [];
  if (candidate.safety.status === 'REJECT') reasons.push(...candidate.safety.reasons);
  if (candidate.score.total < minimumAmazonScore) {
    reasons.push(`Amazon score ${candidate.score.total} is below minimum ${minimumAmazonScore}.`);
  }
  return [...new Set(reasons)];
}

export function selectAmazonDiscoveryQueries(
  profile: ReturnType<typeof getAmazonDiscoveryProfile>,
  category: ReturnType<typeof getAmazonDiscoveryCategory>,
  query: string | undefined,
  limit: number
): string[] {
  const trimmed = query?.trim();
  if (trimmed) return [trimmed];

  const seeds = category.seedQueries.length > 0 ? category.seedQueries : [profile.label];
  const queryCount = Math.min(seeds.length, Math.max(1, Math.ceil(limit / 10)));
  return seeds.slice(0, queryCount);
}

export async function buildAmazonDiscoveryCandidates(options: AmazonDiscoveryRunOptions): Promise<{
  profile: ReturnType<typeof getAmazonDiscoveryProfile>;
  category: ReturnType<typeof getAmazonDiscoveryCategory>;
  queries: string[];
  candidates: AmazonDiscoveryCandidateResult[];
  rejected: AmazonDiscoveryCandidateResult[];
  filters: Record<string, unknown>;
}> {
  const profile = getAmazonDiscoveryProfile(options.profileKey);
  const category = getAmazonDiscoveryCategory(profile, options.categoryKey);
  const limit = Math.min(Math.max(options.limit ?? profile.defaultLimit, 1), 100);
  const safeMode = options.safeMode ?? options.ruleConfig.safeMode;
  const maxAmazonCostUsd = options.maxAmazonCostUsd ?? options.ruleConfig.maxAmazonCostUsd ?? profile.maxAmazonCostUsd;
  const minimumAmazonScore = options.minimumAmazonScore ?? profile.minimumAmazonScore;
  const minPriceDropPercent = options.minPriceDropPercent ?? profile.minPriceDropPercent;
  const query = options.query?.trim();
  const queries = selectAmazonDiscoveryQueries(profile, category, query, limit);
  const policy = safetyPolicy(options.ruleConfig, safeMode, maxAmazonCostUsd);

  const byAsin = new Map<string, AmazonMatchInput>();
  for (const seed of queries) {
    const matches = await findAmazonMatches({
      query: seed,
      apiKey: options.keepaApiKey,
      limit: Math.max(3, Math.ceil(limit / Math.max(queries.length, 1)))
    });
    for (const match of matches) {
      if (!byAsin.has(match.asin)) byAsin.set(match.asin, match);
    }
  }

  const reviewed = [...byAsin.values()].slice(0, limit).map((amazon) => {
    const safety = evaluateAmazonProductSafety(amazon, policy);
    const score = scoreAmazonDiscoveryCandidate(amazon, {
      minPriceDropPercent,
      maxAmazonCostUsd,
      minimumAmazonScore
    }, safety.riskFlags);
    const base = { amazon, score, safety };
    return { ...base, rejectionReasons: amazonRejectionReasons(base, minimumAmazonScore) };
  }).sort((a, b) => b.score.total - a.score.total);

  const candidates = reviewed.filter((candidate) => candidate.safety.status !== 'REJECT' && candidate.score.total >= minimumAmazonScore);
  const rejected = reviewed.filter((candidate) => candidate.safety.status === 'REJECT' || candidate.score.total < minimumAmazonScore);

  return {
    profile,
    category,
    queries,
    candidates,
    rejected,
    filters: {
      profileKey: profile.key,
      categoryKey: category.key,
      query,
      queries,
      limit,
      mode: options.mode ?? 'MANUAL',
      safeMode,
      minimumAmazonScore,
      maxAmazonCostUsd,
      minPriceDropPercent
    }
  };
}

export async function persistAmazonDiscoveryRun(
  db: PrismaClient,
  options: AmazonDiscoveryRunOptions,
  result: Awaited<ReturnType<typeof buildAmazonDiscoveryCandidates>>
): Promise<unknown> {
  const run = await db.amazonDiscoveryRun.create({
    data: {
      profileKey: result.profile.key,
      categoryKey: result.category.key,
      query: options.query?.trim(),
      mode: options.mode ?? 'MANUAL',
      status: 'COMPLETED',
      filtersJson: result.filters,
      scannedCount: result.candidates.length + result.rejected.length,
      acceptedCount: result.candidates.length,
      rejectedCount: result.rejected.length,
      completedAt: new Date()
    }
  });

  const persistCandidate = async (candidate: AmazonDiscoveryCandidateResult, accepted: boolean): Promise<void> => {
    await db.amazonDiscoveryCandidate.create({
      data: {
        runId: run.id,
        asin: candidate.amazon.asin,
        title: candidate.amazon.title,
        amazonUrl: candidate.amazon.url,
        brand: candidate.amazon.brand,
        rootCategory: candidate.amazon.rootCategory,
        categoryTree: candidate.amazon.categoryTree,
        currentPrice: money(candidate.amazon.currentPrice),
        buyBoxPrice: money(candidate.amazon.buyBoxPrice),
        avg90Price: money(candidate.amazon.avg90Price),
        priceDropPercent: decimal(candidate.amazon.priceDropPercent),
        availabilityStatus: candidate.amazon.availabilityStatus,
        salesRank: candidate.amazon.salesRank,
        rating: decimal(candidate.amazon.rating),
        reviewCount: candidate.amazon.reviewCount,
        amazonScore: candidate.score.total,
        safetyStatus: candidate.safety.status,
        riskFlags: candidate.safety.riskFlags,
        scoreBreakdown: {
          ...candidate.score,
          rejectionReasons: candidate.rejectionReasons
        },
        selected: accepted && (options.mode ?? 'MANUAL') === 'AUTO',
        comparisonStatus: accepted ? 'NOT_COMPARED' : 'REJECTED',
        rawKeepaJson: candidate.amazon.raw
      }
    });
  };

  for (const candidate of result.candidates) await persistCandidate(candidate, true);
  for (const candidate of result.rejected) await persistCandidate(candidate, false);

  return db.amazonDiscoveryRun.findUnique({
    where: { id: run.id },
    include: { candidates: { orderBy: { amazonScore: 'desc' } } }
  });
}

function searchQueryForAmazonProduct(amazon: AmazonMatchInput): string {
  const parts = [amazon.brand, amazon.model, amazon.title].filter(Boolean);
  return [...new Set(parts)].join(' ').slice(0, 160);
}

function bestOpportunityForAmazonProduct(
  amazon: AmazonMatchInput,
  ebayCandidates: EbayCandidateInput[],
  ruleConfig: ActiveRuleConfig
): ProductOpportunity | undefined {
  const policy = safetyPolicy(ruleConfig, ruleConfig.safeMode, ruleConfig.maxAmazonCostUsd);
  const scored = ebayCandidates.flatMap((ebay) => {
    const matchConfidence = scoreAmazonMatch(ebay, amazon);
    const matchedAmazon = { ...amazon, matchConfidence };
    const amazonCost = matchedAmazon.buyBoxPrice ?? matchedAmazon.currentPrice;
    if (!ebay.soldPrice || !amazonCost) return [];

    const profit = calculateProfit({
      ebaySalePrice: ebay.soldPrice,
      amazonItemCost: amazonCost,
      estimatedSalesTaxRate: ruleConfig.estimatedSalesTaxRate,
      returnRiskBuffer: ruleConfig.returnRiskBuffer,
      priceChangeBuffer: ruleConfig.priceChangeBuffer
    });
    const safety = evaluateProductSafety(ebay, matchedAmazon, policy);
    const baseDecision = safety.status === 'REJECT'
      ? {
        decision: 'REJECT' as const,
        confidence: 0.95,
        riskFlags: safety.riskFlags,
        reasoningSummary: `Rejected by safety policy: ${safety.reasons.join(' ')}`
      }
      : decideOpportunity(ebay, matchedAmazon, profit, ruleConfig.thresholds);
    const opportunity: ProductOpportunity = {
      ebay,
      amazon: matchedAmazon,
      profit,
      decision: baseDecision,
      safety,
      discoveryProfile: 'amazon-first'
    };
    const score = scoreOpportunity(opportunity, {
      minimumProfitUsd: ruleConfig.thresholds.minimumProfitUsd,
      minimumRoiPercent: ruleConfig.thresholds.minimumRoiPercent,
      minimumOpportunityScore: ruleConfig.minimumOpportunityScore
    }, [...new Set([...safety.riskFlags, ...baseDecision.riskFlags])]);
    const decision = baseDecision.decision !== 'REJECT' && score.total < ruleConfig.minimumOpportunityScore
      ? {
        decision: 'REJECT' as const,
        confidence: 0.8,
        riskFlags: [...new Set([...baseDecision.riskFlags, 'LOW_OPPORTUNITY_SCORE'])],
        reasoningSummary: `Rejected because opportunity score ${score.total} is below ${ruleConfig.minimumOpportunityScore}.`
      }
      : baseDecision;
    return [{ ...opportunity, decision, score }];
  });

  return scored.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))[0];
}

export async function compareAmazonDiscoveryCandidates(options: CompareAmazonCandidatesOptions): Promise<{
  compared: number;
  opportunities: ProductOpportunity[];
  rejected: ProductOpportunity[];
}> {
  const where = options.candidateIds?.length
    ? { id: { in: options.candidateIds } }
    : {
      runId: options.runId,
      selected: true,
      comparisonStatus: { in: ['NOT_COMPARED', 'ERROR'] }
    };
  const candidates = await options.db.amazonDiscoveryCandidate.findMany({
    where: {
      ...where,
      comparisonStatus: { in: ['NOT_COMPARED', 'ERROR'] }
    },
    orderBy: { amazonScore: 'desc' },
    take: options.limit ?? 25
  });

  const opportunities: ProductOpportunity[] = [];
  const rejected: ProductOpportunity[] = [];

  for (const candidate of candidates) {
    const amazon = amazonFromRecord(candidate as Record<string, unknown>);
    await options.db.amazonDiscoveryCandidate.update({ where: { id: candidate.id }, data: { selected: true, comparisonStatus: 'COMPARING' } });
    try {
      const ebayCandidates = await searchEbayCandidates({
        query: searchQueryForAmazonProduct(amazon),
        apiKey: options.serpApiKey,
        limit: 8
      });
      const best = bestOpportunityForAmazonProduct(amazon, ebayCandidates, options.ruleConfig);
      if (!best) {
        await options.db.amazonDiscoveryCandidate.update({ where: { id: candidate.id }, data: { comparisonStatus: 'REJECTED' } });
        continue;
      }
      if (best.decision.decision === 'REJECT') {
        rejected.push(best);
        await options.db.amazonDiscoveryCandidate.update({ where: { id: candidate.id }, data: { comparisonStatus: 'REJECTED' } });
        continue;
      }

      const persisted = await persistOpportunity(options.db, best, {
        discoveryProfile: 'amazon-first',
        amazonCandidateId: candidate.id
      });
      opportunities.push(best);
      await options.db.amazonDiscoveryCandidate.update({
        where: { id: candidate.id },
        data: {
          comparisonStatus: 'OPPORTUNITY',
          productCandidateId: persisted.productCandidateId,
          amazonMatchId: persisted.amazonMatchId
        }
      });
    } catch (error) {
      await options.db.amazonDiscoveryCandidate.update({
        where: { id: candidate.id },
        data: { comparisonStatus: 'ERROR' }
      });
      throw error;
    }
  }

  if (options.runId) {
    await options.db.amazonDiscoveryRun.update({
      where: { id: options.runId },
      data: {
        comparedCount: { increment: candidates.length },
        opportunityCount: { increment: opportunities.length }
      }
    });
  }

  return { compared: candidates.length, opportunities, rejected };
}
