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

export interface EbayComparisonReport {
  status: 'OPPORTUNITY' | 'REJECTED' | 'NO_EBAY_RESULTS' | 'NO_PRICED_EBAY_RESULTS' | 'ERROR';
  query: string;
  ebayResultCount: number;
  pricedResultCount: number;
  evaluatedCount: number;
  amazonCost?: number;
  best?: {
    title: string;
    url?: string;
    soldPrice?: number;
    shippingPrice?: number;
    condition?: string;
    matchConfidence?: number;
    expectedProfit?: number;
    roiPercent?: number;
    opportunityScore?: number;
    decision?: string;
    riskFlags?: string[];
    reasoningSummary?: string;
  };
  topMatches: Array<{
    title: string;
    url?: string;
    soldPrice?: number;
    shippingPrice?: number;
    condition?: string;
    matchConfidence?: number;
    expectedProfit?: number;
    roiPercent?: number;
    opportunityScore?: number;
    decision?: string;
    riskFlags?: string[];
  }>;
  reasons: string[];
  thresholds: {
    minimumProfitUsd: number;
    minimumRoiPercent: number;
    minimumMatchConfidence: number;
    minimumOpportunityScore: number;
  };
  comparedAt: string;
}

const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);
const decimal = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(3);
const percent = (value: number | undefined): string => value === undefined ? 'unknown' : `${value.toFixed(1)}%`;
const dollars = (value: number | undefined): string => value === undefined ? 'unknown' : `$${value.toFixed(2)}`;
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

function comparisonSnapshot(opportunity: ProductOpportunity): NonNullable<EbayComparisonReport['best']> {
  return {
    title: opportunity.ebay.title,
    url: opportunity.ebay.url,
    soldPrice: opportunity.ebay.soldPrice,
    shippingPrice: opportunity.ebay.shippingPrice,
    condition: opportunity.ebay.condition,
    matchConfidence: opportunity.amazon.matchConfidence,
    expectedProfit: opportunity.profit.expectedProfit,
    roiPercent: opportunity.profit.roiPercent,
    opportunityScore: opportunity.score?.total,
    decision: opportunity.decision.decision,
    riskFlags: opportunity.decision.riskFlags,
    reasoningSummary: opportunity.decision.reasoningSummary
  };
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))];
}

function comparisonRejectionReasons(
  opportunity: ProductOpportunity,
  ruleConfig: ActiveRuleConfig
): string[] {
  const amazonCost = opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice;
  const soldPrice = opportunity.ebay.soldPrice;
  const reasons: string[] = [];

  if (soldPrice !== undefined && amazonCost !== undefined && soldPrice <= amazonCost) {
    reasons.push(`Best eBay sold price ${dollars(soldPrice)} is not above Amazon cost ${dollars(amazonCost)} before fees, tax, and buffers.`);
  }
  if (opportunity.decision.riskFlags.includes('LOW_PROFIT')) {
    reasons.push(`Expected profit ${dollars(opportunity.profit.expectedProfit)} is below the ${dollars(ruleConfig.thresholds.minimumProfitUsd)} minimum.`);
  }
  if (opportunity.decision.riskFlags.includes('LOW_ROI')) {
    reasons.push(`ROI ${percent(opportunity.profit.roiPercent)} is below the ${percent(ruleConfig.thresholds.minimumRoiPercent)} target.`);
  }
  if (opportunity.decision.riskFlags.includes('LOW_MATCH_CONFIDENCE')) {
    reasons.push(`Best eBay match confidence ${percent((opportunity.amazon.matchConfidence ?? 0) * 100)} is below the ${percent(ruleConfig.thresholds.minimumMatchConfidence * 100)} minimum, so it may not be the same product.`);
  }
  if (opportunity.decision.riskFlags.includes('MISSING_EBAY_PRICE')) {
    reasons.push('The best eBay result did not include a usable sold price.');
  }
  if (opportunity.decision.riskFlags.includes('MISSING_AMAZON_PRICE')) {
    reasons.push('Amazon price is missing, so profit cannot be calculated safely.');
  }
  if (opportunity.decision.riskFlags.includes('AMAZON_STOCK_UNKNOWN')) {
    reasons.push('Amazon stock status is not confirmed as in stock.');
  }
  if (opportunity.decision.riskFlags.includes('LOW_OPPORTUNITY_SCORE') && opportunity.score) {
    reasons.push(`Overall comparison score ${opportunity.score.total} is below the ${ruleConfig.minimumOpportunityScore} minimum after profit, ROI, demand, match, and risk scoring.`);
  }
  if (opportunity.safety?.reasons.length) reasons.push(...opportunity.safety.reasons);
  if (!reasons.length && opportunity.decision.reasoningSummary) reasons.push(opportunity.decision.reasoningSummary);

  return uniqueReasons(reasons);
}

function scoreEbayCandidateAgainstAmazon(
  amazon: AmazonMatchInput,
  ebay: EbayCandidateInput,
  ruleConfig: ActiveRuleConfig
): ProductOpportunity | undefined {
  const matchConfidence = scoreAmazonMatch(ebay, amazon);
  const matchedAmazon = { ...amazon, matchConfidence };
  const amazonCost = matchedAmazon.buyBoxPrice ?? matchedAmazon.currentPrice;
  if (!ebay.soldPrice || !amazonCost) return undefined;

  const profit = calculateProfit({
    ebaySalePrice: ebay.soldPrice,
    amazonItemCost: amazonCost,
    estimatedSalesTaxRate: ruleConfig.estimatedSalesTaxRate,
    returnRiskBuffer: ruleConfig.returnRiskBuffer,
    priceChangeBuffer: ruleConfig.priceChangeBuffer
  });
  const policy = safetyPolicy(ruleConfig, ruleConfig.safeMode, ruleConfig.maxAmazonCostUsd);
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
  return { ...opportunity, decision, score };
}

export function analyzeAmazonEbayComparison(
  amazon: AmazonMatchInput,
  ebayCandidates: EbayCandidateInput[],
  ruleConfig: ActiveRuleConfig,
  query: string
): {
  best?: ProductOpportunity;
  report: EbayComparisonReport;
} {
  const amazonCost = amazon.buyBoxPrice ?? amazon.currentPrice;
  const pricedResultCount = ebayCandidates.filter((ebay) => ebay.soldPrice !== undefined).length;
  const thresholds = {
    minimumProfitUsd: ruleConfig.thresholds.minimumProfitUsd,
    minimumRoiPercent: ruleConfig.thresholds.minimumRoiPercent,
    minimumMatchConfidence: ruleConfig.thresholds.minimumMatchConfidence,
    minimumOpportunityScore: ruleConfig.minimumOpportunityScore
  };
  const baseReport = {
    query,
    ebayResultCount: ebayCandidates.length,
    pricedResultCount,
    amazonCost,
    thresholds,
    comparedAt: new Date().toISOString()
  };

  if (ebayCandidates.length === 0) {
    return {
      report: {
        ...baseReport,
        status: 'NO_EBAY_RESULTS',
        evaluatedCount: 0,
        topMatches: [],
        reasons: ['No completed/sold eBay listings were found for this Amazon product search.']
      }
    };
  }

  if (!amazonCost) {
    return {
      report: {
        ...baseReport,
        status: 'REJECTED',
        evaluatedCount: 0,
        topMatches: [],
        reasons: ['Amazon price is missing, so eBay profit cannot be calculated safely.']
      }
    };
  }

  const scored = ebayCandidates
    .flatMap((ebay) => {
      const opportunity = scoreEbayCandidateAgainstAmazon(amazon, ebay, ruleConfig);
      return opportunity ? [opportunity] : [];
    })
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  if (scored.length === 0) {
    return {
      report: {
        ...baseReport,
        status: pricedResultCount === 0 ? 'NO_PRICED_EBAY_RESULTS' : 'REJECTED',
        evaluatedCount: 0,
        topMatches: [],
        reasons: pricedResultCount === 0
          ? ['eBay returned results, but none included a usable sold price.']
          : ['No eBay result could be evaluated against the Amazon price.']
      }
    };
  }

  const accepted = scored.filter((opportunity) => opportunity.decision.decision !== 'REJECT');
  const best = accepted[0] ?? scored[0];
  const topMatches = scored.slice(0, 3).map(comparisonSnapshot);
  const status = best.decision.decision === 'REJECT' ? 'REJECTED' : 'OPPORTUNITY';
  const reasons = status === 'REJECTED'
    ? comparisonRejectionReasons(best, ruleConfig)
    : uniqueReasons([
      `Best eBay sold price ${dollars(best.ebay.soldPrice)} leaves ${dollars(best.profit.expectedProfit)} expected profit.`,
      `ROI ${percent(best.profit.roiPercent)} clears the ${percent(ruleConfig.thresholds.minimumRoiPercent)} target.`,
      `Match confidence ${percent((best.amazon.matchConfidence ?? 0) * 100)} clears the ${percent(ruleConfig.thresholds.minimumMatchConfidence * 100)} minimum.`
    ]);

  return {
    best,
    report: {
      ...baseReport,
      status,
      evaluatedCount: scored.length,
      best: comparisonSnapshot(best),
      topMatches,
      reasons
    }
  };
}

function scoreBreakdownWithComparison(existing: unknown, report: EbayComparisonReport): Record<string, unknown> {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};
  return { ...base, ebayComparison: jsonReady(report) };
}

function jsonReady(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonReady);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, jsonReady(item)])
  );
}

export async function compareAmazonDiscoveryCandidates(options: CompareAmazonCandidatesOptions): Promise<{
  compared: number;
  opportunities: ProductOpportunity[];
  rejected: ProductOpportunity[];
  reports: EbayComparisonReport[];
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
  const reports: EbayComparisonReport[] = [];

  for (const candidate of candidates) {
    const amazon = amazonFromRecord(candidate as Record<string, unknown>);
    await options.db.amazonDiscoveryCandidate.update({ where: { id: candidate.id }, data: { selected: true, comparisonStatus: 'COMPARING' } });
    try {
      const query = searchQueryForAmazonProduct(amazon);
      const ebayCandidates = await searchEbayCandidates({
        query,
        apiKey: options.serpApiKey,
        limit: 8
      });
      const comparison = analyzeAmazonEbayComparison(amazon, ebayCandidates, options.ruleConfig, query);
      reports.push(comparison.report);
      const best = comparison.best;
      if (!best) {
        await options.db.amazonDiscoveryCandidate.update({
          where: { id: candidate.id },
          data: {
            comparisonStatus: 'REJECTED',
            scoreBreakdown: scoreBreakdownWithComparison(candidate.scoreBreakdown, comparison.report)
          }
        });
        continue;
      }
      if (best.decision.decision === 'REJECT') {
        rejected.push(best);
        await options.db.amazonDiscoveryCandidate.update({
          where: { id: candidate.id },
          data: {
            comparisonStatus: 'REJECTED',
            scoreBreakdown: scoreBreakdownWithComparison(candidate.scoreBreakdown, comparison.report)
          }
        });
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
          amazonMatchId: persisted.amazonMatchId,
          scoreBreakdown: scoreBreakdownWithComparison(candidate.scoreBreakdown, comparison.report)
        }
      });
    } catch (error) {
      const report: EbayComparisonReport = {
        status: 'ERROR',
        query: searchQueryForAmazonProduct(amazon),
        ebayResultCount: 0,
        pricedResultCount: 0,
        evaluatedCount: 0,
        amazonCost: amazon.buyBoxPrice ?? amazon.currentPrice,
        topMatches: [],
        reasons: [error instanceof Error ? error.message : 'eBay comparison failed.'],
        thresholds: {
          minimumProfitUsd: options.ruleConfig.thresholds.minimumProfitUsd,
          minimumRoiPercent: options.ruleConfig.thresholds.minimumRoiPercent,
          minimumMatchConfidence: options.ruleConfig.thresholds.minimumMatchConfidence,
          minimumOpportunityScore: options.ruleConfig.minimumOpportunityScore
        },
        comparedAt: new Date().toISOString()
      };
      await options.db.amazonDiscoveryCandidate.update({
        where: { id: candidate.id },
        data: {
          comparisonStatus: 'ERROR',
          scoreBreakdown: scoreBreakdownWithComparison(candidate.scoreBreakdown, report)
        }
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

  return { compared: candidates.length, opportunities, rejected, reports };
}
