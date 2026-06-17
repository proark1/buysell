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
import { applyIdentityDecision, evaluateProductIdentity } from './productIdentityMatcher.js';
import { profitInputsFromRuleConfig } from './profitInputs.js';
import { buildOpportunityEvidence } from './opportunityEvidence.js';
import { calculateEbayMarketMetrics } from './marketMetrics.js';
import type { ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { persistOpportunity } from '../repositories/opportunityRepository.js';
import { createActionForDecision } from '../repositories/actionRepository.js';
import { postgresInt } from '../utils/postgres.js';
import {
  getAmazonDiscoveryMarket,
  resolveEbayComparisonSettings,
  type DiscoveryMarket,
  type EbayComparisonSettings
} from './marketplaces.js';
import { notFound } from '../security/httpErrors.js';

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
  marketKey?: string;
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
  marketKey?: string;
  comparisonSettings?: Partial<EbayComparisonSettings>;
  force?: boolean;
}

export interface EbayComparisonReport {
  status: 'OPPORTUNITY' | 'MANUAL_REVIEW' | 'REJECTED' | 'NO_EBAY_RESULTS' | 'NO_PRICED_EBAY_RESULTS' | 'ERROR';
  query: string;
  ebayResultCount: number;
  pricedResultCount: number;
  evaluatedCount: number;
  amazonCost?: number;
  market?: {
    key: string;
    label: string;
    currency: string;
    currencySymbol: string;
    amazonDomain: string;
    ebayDomain: string;
  };
  settings?: {
    presetKey: string;
    minimumProfit: number;
    minimumRoiPercent: number;
    minimumMatchConfidence: number;
    minimumOpportunityScore: number;
    ebayResultLimit: number;
    soldOnly: boolean;
    completedOnly: boolean;
    buyingFormat: string;
    itemCondition: string;
    preferredLocation: string;
    postalCode?: string;
  };
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
    identityMatch?: ProductOpportunity['identityMatch'];
    marketMetrics?: ProductOpportunity['marketMetrics'];
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
    identityMatch?: ProductOpportunity['identityMatch'];
    marketMetrics?: ProductOpportunity['marketMetrics'];
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

export interface ConsiderAmazonCandidateOptions {
  db: PrismaClient;
  candidateId: string;
  ruleConfig: ActiveRuleConfig;
  note?: string;
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
  const market = getAmazonDiscoveryMarket(options.marketKey);

  const byAsin = new Map<string, AmazonMatchInput>();
  for (const seed of queries) {
    const matches = await findAmazonMatches({
      query: seed,
      apiKey: options.keepaApiKey,
      domain: market.amazonDomainId,
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
      marketKey: market.key,
      market,
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
  const transactionalDb = db as unknown as {
    $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  };
  return transactionalDb.$transaction(async (tx) => {
    const run = await tx.amazonDiscoveryRun.create({
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
      await tx.amazonDiscoveryCandidate.create({
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
          salesRank: postgresInt(candidate.amazon.salesRank),
          rating: decimal(candidate.amazon.rating),
          reviewCount: postgresInt(candidate.amazon.reviewCount),
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

    return tx.amazonDiscoveryRun.findUnique({
      where: { id: run.id },
      include: { candidates: { orderBy: { amazonScore: 'desc' } } }
    });
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
    reasoningSummary: opportunity.decision.reasoningSummary,
    identityMatch: opportunity.identityMatch,
    marketMetrics: opportunity.marketMetrics
  };
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))];
}

function reportMarket(market: DiscoveryMarket): NonNullable<EbayComparisonReport['market']> {
  return {
    key: market.key,
    label: market.label,
    currency: market.currency,
    currencySymbol: market.currencySymbol,
    amazonDomain: market.amazonDomain,
    ebayDomain: market.ebayDomain
  };
}

function reportSettings(settings: EbayComparisonSettings): NonNullable<EbayComparisonReport['settings']> {
  return {
    presetKey: settings.presetKey,
    minimumProfit: settings.minimumProfit,
    minimumRoiPercent: settings.minimumRoiPercent,
    minimumMatchConfidence: settings.minimumMatchConfidence,
    minimumOpportunityScore: settings.minimumOpportunityScore,
    ebayResultLimit: settings.ebayResultLimit,
    soldOnly: settings.soldOnly,
    completedOnly: settings.completedOnly,
    buyingFormat: settings.buyingFormat,
    itemCondition: settings.itemCondition,
    preferredLocation: settings.preferredLocation,
    postalCode: settings.postalCode
  };
}

const conditionIdsBySetting: Record<EbayComparisonSettings['itemCondition'], string[]> = {
  ANY: [],
  NEW: ['1000'],
  USED: ['3000'],
  OPEN_BOX: ['1500']
};

function manualReviewCandidate(opportunity: ProductOpportunity, ruleConfig: ActiveRuleConfig): boolean {
  const flags = opportunity.decision.riskFlags;
  if (flags.some((flag) => ['BLOCKED_BRAND', 'BLOCKED_CATEGORY', 'BLOCKED_KEYWORD', 'AMAZON_COST_TOO_HIGH', 'MISSING_AMAZON_PRICE', 'MISSING_EBAY_PRICE', 'PRODUCT_IDENTITY_CONFLICT', 'BRAND_MISMATCH', 'MODEL_MISMATCH', 'BUNDLE_OR_QUANTITY_MISMATCH', 'VARIANT_MISMATCH'].includes(flag))) {
    return false;
  }

  const matchConfidence = opportunity.amazon.matchConfidence ?? 0;
  const minimumMatchFloor = Math.max(0.35, ruleConfig.thresholds.minimumMatchConfidence - 0.2);
  const minimumProfitFloor = Math.max(1, ruleConfig.thresholds.minimumProfitUsd * 0.8);
  const minimumRoiFloor = Math.max(5, ruleConfig.thresholds.minimumRoiPercent * 0.6);
  return matchConfidence >= minimumMatchFloor
    && opportunity.profit.expectedProfit >= minimumProfitFloor
    && opportunity.profit.roiPercent >= minimumRoiFloor;
}

function manualReviewReasons(opportunity: ProductOpportunity, ruleConfig: ActiveRuleConfig): string[] {
  return uniqueReasons([
    ...comparisonRejectionReasons(opportunity, ruleConfig),
    `Profit ${dollars(opportunity.profit.expectedProfit)} and ROI ${percent(opportunity.profit.roiPercent)} are promising, but one or more gates need human verification before listing.`
  ]);
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
  if (opportunity.decision.riskFlags.includes('PRODUCT_IDENTITY_CONFLICT')) {
    reasons.push(...(opportunity.identityMatch?.conflicts ?? ['Product identity conflicts were found.']));
  }
  if (opportunity.decision.riskFlags.includes('PRODUCT_IDENTITY_UNVERIFIED')) {
    reasons.push(...(opportunity.identityMatch?.conflicts ?? ['Exact product identity is not proven by brand plus model or identifier evidence.']));
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
  const identityMatch = evaluateProductIdentity(ebay, matchedAmazon);
  const amazonCost = matchedAmazon.buyBoxPrice ?? matchedAmazon.currentPrice;
  if (!ebay.soldPrice || !amazonCost) return undefined;

  const profit = calculateProfit({
    ebaySalePrice: ebay.soldPrice,
    amazonItemCost: amazonCost,
    ...profitInputsFromRuleConfig(ruleConfig)
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
  const identityDecision = applyIdentityDecision(baseDecision, identityMatch);
  const opportunity: ProductOpportunity = {
    ebay,
    amazon: matchedAmazon,
    profit,
    identityMatch,
    decision: identityDecision,
    safety,
    discoveryProfile: 'amazon-first'
  };
  const score = scoreOpportunity(opportunity, {
    minimumProfitUsd: ruleConfig.thresholds.minimumProfitUsd,
    minimumRoiPercent: ruleConfig.thresholds.minimumRoiPercent,
    minimumOpportunityScore: ruleConfig.minimumOpportunityScore
  }, [...new Set([...safety.riskFlags, ...identityDecision.riskFlags])]);
  const decision = identityDecision.decision !== 'REJECT' && identityMatch.status !== 'REVIEW' && score.total < ruleConfig.minimumOpportunityScore
    ? {
      decision: 'REJECT' as const,
      confidence: 0.8,
      riskFlags: [...new Set([...identityDecision.riskFlags, 'LOW_OPPORTUNITY_SCORE'])],
      reasoningSummary: `Rejected because opportunity score ${score.total} is below ${ruleConfig.minimumOpportunityScore}.`
    }
    : identityDecision;
  return { ...opportunity, decision, score };
}

export function analyzeAmazonEbayComparison(
  amazon: AmazonMatchInput,
  ebayCandidates: EbayCandidateInput[],
  ruleConfig: ActiveRuleConfig,
  query: string,
  context: {
    market?: DiscoveryMarket;
    comparisonSettings?: EbayComparisonSettings;
  } = {}
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
    market: context.market ? reportMarket(context.market) : undefined,
    settings: context.comparisonSettings ? reportSettings(context.comparisonSettings) : undefined,
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

  const marketMetrics = calculateEbayMarketMetrics({
    soldCandidates: ebayCandidates,
    targetPrice: scored[0]?.decision.recommendedPrice ?? amazonCost,
    minimumSellThroughRate: ruleConfig.minimumSellThroughRate,
    maximumCompetitionRatio: ruleConfig.maximumCompetitionRatio
  });
  for (const opportunity of scored) {
    opportunity.marketMetrics = marketMetrics;
    opportunity.evidence = buildOpportunityEvidence(opportunity);
    opportunity.score = scoreOpportunity(opportunity, {
      minimumProfitUsd: ruleConfig.thresholds.minimumProfitUsd,
      minimumRoiPercent: ruleConfig.thresholds.minimumRoiPercent,
      minimumOpportunityScore: ruleConfig.minimumOpportunityScore
    }, [...new Set([
      ...(opportunity.safety?.riskFlags ?? []),
      ...opportunity.decision.riskFlags,
      ...marketMetrics.riskFlags
    ])]);
    if (opportunity.decision.decision !== 'REJECT' && opportunity.identityMatch?.status !== 'REVIEW' && opportunity.score.total < ruleConfig.minimumOpportunityScore) {
      opportunity.decision = {
        decision: 'REJECT',
        confidence: 0.8,
        riskFlags: [...new Set([...opportunity.decision.riskFlags, ...marketMetrics.riskFlags, 'LOW_OPPORTUNITY_SCORE'])],
        reasoningSummary: `Rejected because opportunity score ${opportunity.score.total} is below ${ruleConfig.minimumOpportunityScore}.`
      };
      opportunity.evidence = buildOpportunityEvidence(opportunity);
    }
  }
  scored.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

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
  const status = best.decision.decision === 'REJECT'
    ? manualReviewCandidate(best, ruleConfig) ? 'MANUAL_REVIEW' : 'REJECTED'
    : best.decision.decision === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : 'OPPORTUNITY';
  const reasons = status === 'OPPORTUNITY'
    ? uniqueReasons([
      `Best eBay sold price ${dollars(best.ebay.soldPrice)} leaves ${dollars(best.profit.expectedProfit)} expected profit.`,
      `ROI ${percent(best.profit.roiPercent)} clears the ${percent(ruleConfig.thresholds.minimumRoiPercent)} target.`,
      `Match confidence ${percent((best.amazon.matchConfidence ?? 0) * 100)} clears the ${percent(ruleConfig.thresholds.minimumMatchConfidence * 100)} minimum.`,
      ...(best.marketMetrics?.reasons ?? []),
      ...(best.identityMatch?.evidence ?? [])
    ])
    : status === 'MANUAL_REVIEW'
      ? manualReviewReasons(best, ruleConfig)
      : comparisonRejectionReasons(best, ruleConfig);

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
  return jsonReady({ ...base, ebayComparison: report }) as Record<string, unknown>;
}

function ebayComparisonFromScoreBreakdown(existing: unknown): EbayComparisonReport | undefined {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return undefined;
  const comparison = (existing as Record<string, unknown>).ebayComparison;
  return comparison && typeof comparison === 'object' && !Array.isArray(comparison)
    ? comparison as EbayComparisonReport
    : undefined;
}

function scoreBreakdownWithManualReview(existing: unknown, review: Record<string, unknown>): Record<string, unknown> {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};
  return jsonReady({ ...base, manualReview: review }) as Record<string, unknown>;
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

export async function considerAmazonDiscoveryCandidate(options: ConsiderAmazonCandidateOptions): Promise<{
  candidateId: string;
  productCandidateId: string;
  amazonMatchId?: string;
  actionItemId?: string;
  alreadyConsidered: boolean;
}> {
  const candidate = await options.db.amazonDiscoveryCandidate.findUnique({ where: { id: options.candidateId } });
  if (!candidate) throw notFound('Amazon discovery candidate not found', 'AMAZON_DISCOVERY_CANDIDATE_NOT_FOUND');
  if (candidate.productCandidateId) {
    return {
      candidateId: candidate.id,
      productCandidateId: candidate.productCandidateId,
      amazonMatchId: candidate.amazonMatchId ?? undefined,
      alreadyConsidered: true
    };
  }

  const report = ebayComparisonFromScoreBreakdown(candidate.scoreBreakdown);
  const amazon = amazonFromRecord(candidate as Record<string, unknown>);
  const best = report?.best;
  const review = {
    note: options.note?.trim() || undefined,
    forcedAt: new Date().toISOString(),
    originalStatus: candidate.comparisonStatus,
    reasons: report?.reasons ?? ['User asked to manually review this Amazon candidate.']
  };
  const candidateRiskFlags = Array.isArray(candidate.riskFlags)
    ? (candidate.riskFlags as unknown[]).filter((item): item is string => typeof item === 'string')
    : [];
  const riskFlags = uniqueReasons(['USER_OVERRIDE', ...(best?.riskFlags ?? []), ...candidateRiskFlags]);
  const reasoningSummary = `Manual review requested from Discovery. ${report?.reasons?.[0] ?? 'Verify Amazon and eBay fit before listing.'}`;

  if (best?.title && best.soldPrice !== undefined && (amazon.buyBoxPrice ?? amazon.currentPrice) !== undefined) {
    const matchedAmazon = { ...amazon, matchConfidence: best.matchConfidence ?? amazon.matchConfidence ?? 0 };
    const ebay = {
      title: best.title,
      url: best.url,
      soldPrice: best.soldPrice,
      shippingPrice: best.shippingPrice,
      condition: best.condition
    };
    const profit = calculateProfit({
      ebaySalePrice: best.soldPrice,
      amazonItemCost: matchedAmazon.buyBoxPrice ?? matchedAmazon.currentPrice ?? 0,
      ...profitInputsFromRuleConfig(options.ruleConfig)
    });
    const opportunity: ProductOpportunity = {
      ebay,
      amazon: matchedAmazon,
      profit,
      decision: {
        decision: 'MANUAL_REVIEW',
        confidence: 0.55,
        riskFlags,
        reasoningSummary,
        recommendedPrice: best.soldPrice,
        recommendedTitle: best.title.slice(0, 80),
        recommendedDescription: `Manual review candidate from Amazon Scout ASIN ${amazon.asin}. Confirm the eBay match and marketplace before listing.`
      },
      score: {
        total: best.opportunityScore ?? candidate.amazonScore,
        profit: 0,
        roi: 0,
        demand: 0,
        priceSignal: 0,
        match: Math.round((best.matchConfidence ?? 0) * 100),
        riskPenalty: 0,
        reasons: report?.reasons ?? []
      },
      safety: {
        status: 'WARN',
        riskFlags,
        reasons: report?.reasons ?? []
      },
      marketMetrics: best.marketMetrics,
      discoveryProfile: 'amazon-manual-review'
    };
    opportunity.evidence = buildOpportunityEvidence(opportunity);

    const persisted = await persistOpportunity(options.db, opportunity, {
      discoveryProfile: 'amazon-manual-review',
      amazonCandidateId: candidate.id
    });
    await options.db.productCandidate.update({
      where: { id: persisted.productCandidateId },
      data: {
        source: 'amazon-manual-review',
        scoreBreakdown: scoreBreakdownWithManualReview(
          { ...(opportunity.score ?? {}), ebayComparison: report },
          review
        )
      }
    });
    await options.db.amazonDiscoveryCandidate.update({
      where: { id: candidate.id },
      data: {
        selected: true,
        comparisonStatus: 'MANUAL_REVIEW',
        productCandidateId: persisted.productCandidateId,
        amazonMatchId: persisted.amazonMatchId,
        scoreBreakdown: scoreBreakdownWithManualReview(candidate.scoreBreakdown, review)
      }
    });
    return {
      candidateId: candidate.id,
      productCandidateId: persisted.productCandidateId,
      amazonMatchId: persisted.amazonMatchId,
      alreadyConsidered: false
    };
  }

  const productCandidate = await options.db.productCandidate.create({
    data: {
      amazonCandidateId: candidate.id,
      discoveryProfile: 'amazon-manual-review',
      opportunityScore: candidate.amazonScore,
      safetyStatus: 'WARN',
      riskFlags,
      scoreBreakdown: scoreBreakdownWithManualReview(candidate.scoreBreakdown, review),
      evidenceJson: best ? jsonReady({
        productIdentity: best.identityMatch?.evidence ?? [],
        safety: riskFlags
      }) : undefined,
      marketMetricsJson: best?.marketMetrics ? jsonReady(best.marketMetrics) : undefined,
      source: 'amazon-manual-review',
      ebayTitle: best?.title ?? candidate.title,
      ebayUrl: best?.url ?? candidate.amazonUrl,
      ebaySoldPrice: money(best?.soldPrice),
      ebayShippingPrice: money(best?.shippingPrice),
      ebayCondition: best?.condition,
      rawSerpapiJson: report
    }
  });
  const actionItemId = await createActionForDecision(options.db, {
    productCandidateId: productCandidate.id,
    decision: {
      decision: 'MANUAL_REVIEW',
      confidence: 0.45,
      riskFlags,
      reasoningSummary
    }
  });
  await options.db.auditLog.create({
    data: {
      entityType: 'AmazonDiscoveryCandidate',
      entityId: candidate.id,
      action: 'MANUAL_REVIEW_REQUESTED',
      actor: 'dashboard',
      afterJson: {
        productCandidateId: productCandidate.id,
        actionItemId,
        review
      }
    }
  });
  await options.db.amazonDiscoveryCandidate.update({
    where: { id: candidate.id },
    data: {
      selected: true,
      comparisonStatus: 'MANUAL_REVIEW',
      productCandidateId: productCandidate.id,
      scoreBreakdown: scoreBreakdownWithManualReview(candidate.scoreBreakdown, review)
    }
  });

  return {
    candidateId: candidate.id,
    productCandidateId: productCandidate.id,
    actionItemId,
    alreadyConsidered: false
  };
}

export async function compareAmazonDiscoveryCandidates(options: CompareAmazonCandidatesOptions): Promise<{
  compared: number;
  opportunities: ProductOpportunity[];
  manualReviews: ProductOpportunity[];
  rejected: ProductOpportunity[];
  reports: EbayComparisonReport[];
}> {
  const market = getAmazonDiscoveryMarket(options.marketKey);
  const comparisonSettings = resolveEbayComparisonSettings(options.comparisonSettings);
  const allowedStatuses = options.force
    ? ['NOT_COMPARED', 'ERROR', 'REJECTED', 'MANUAL_REVIEW']
    : ['NOT_COMPARED', 'ERROR'];
  const where = options.candidateIds?.length
    ? { id: { in: options.candidateIds } }
    : {
      runId: options.runId,
      selected: true,
      comparisonStatus: { in: allowedStatuses }
    };
  const candidates = await options.db.amazonDiscoveryCandidate.findMany({
    where: {
      ...where,
      comparisonStatus: { in: allowedStatuses }
    },
    orderBy: { amazonScore: 'desc' },
    take: options.limit ?? 25
  });

  const opportunities: ProductOpportunity[] = [];
  const manualReviews: ProductOpportunity[] = [];
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
        ebayDomain: market.ebayDomain,
        soldOnly: comparisonSettings.soldOnly,
        completedOnly: comparisonSettings.completedOnly,
        limit: comparisonSettings.ebayResultLimit,
        buyingFormat: comparisonSettings.buyingFormat === 'ANY' ? undefined : comparisonSettings.buyingFormat,
        conditionIds: conditionIdsBySetting[comparisonSettings.itemCondition],
        preferredLocation: comparisonSettings.preferredLocation === 'ANY' ? undefined : comparisonSettings.preferredLocation,
        postalCode: comparisonSettings.postalCode
      });
      const comparison = analyzeAmazonEbayComparison(amazon, ebayCandidates, options.ruleConfig, query, {
        market,
        comparisonSettings
      });
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
      if (comparison.report.status === 'MANUAL_REVIEW') {
        manualReviews.push(best);
        await options.db.amazonDiscoveryCandidate.update({
          where: { id: candidate.id },
          data: {
            comparisonStatus: 'MANUAL_REVIEW',
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
        market: reportMarket(market),
        settings: reportSettings(comparisonSettings),
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

  return { compared: candidates.length, opportunities, manualReviews, rejected, reports };
}
