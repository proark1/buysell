import type { PrismaClient } from '@prisma/client';
import type { AmazonMatchInput, EbayCandidateInput, ProductOpportunity } from '../domain/products.js';
import { findAmazonMatches } from '../clients/keepaClient.js';
import { searchEbayCandidates } from '../clients/serpApiClient.js';
import { createActionForDecision } from '../repositories/actionRepository.js';
import { persistOpportunity } from '../repositories/opportunityRepository.js';
import type { ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { calculateProfit } from './profitCalculator.js';
import { decideOpportunity } from './opportunityDecider.js';
import {
  ebayFixedNewListingRisks,
  evaluateProductSafety,
  getEbayDiscoveryCategory,
  getEbayDiscoveryProfile,
  type SafetyPolicy
} from './discoveryPolicy.js';
import { scoreAmazonMatch } from './matchScorer.js';
import { getEbayDiscoveryMarket, type DiscoveryMarket } from './marketplaces.js';
import { scoreOpportunity } from './opportunityScorer.js';
import { applyIdentityDecision, evaluateProductIdentity } from './productIdentityMatcher.js';
import { notFound } from '../security/httpErrors.js';
import { profitInputsFromRuleConfig } from './profitInputs.js';
import { buildOpportunityEvidence } from './opportunityEvidence.js';
import { calculateEbayMarketMetrics } from './marketMetrics.js';

export interface EbayDiscoveryScore {
  total: number;
  price: number;
  condition: number;
  metadata: number;
  category: number;
  riskPenalty: number;
  reasons: string[];
}

export interface EbayDiscoveryCandidateResult {
  ebay: EbayCandidateInput;
  score: EbayDiscoveryScore;
  safety: {
    status: 'PASS' | 'WARN' | 'REJECT';
    riskFlags: string[];
    reasons: string[];
  };
  rejectionReasons: string[];
}

export interface EbayDiscoveryRunOptions {
  serpApiKey: string;
  ruleConfig: ActiveRuleConfig;
  profileKey?: string;
  categoryKey?: string;
  marketKey?: string;
  query?: string;
  limit?: number;
  mode?: 'MANUAL' | 'AUTO';
  safeMode?: boolean;
  minimumEbayScore?: number;
  minSoldPrice?: number;
  maxSoldPrice?: number;
  soldOnly?: boolean;
  completedOnly?: boolean;
  buyingFormat?: 'ANY' | 'BIN' | 'Auction' | 'BO';
  itemCondition?: 'ANY' | 'NEW' | 'USED' | 'OPEN_BOX';
  preferredLocation?: 'ANY' | 'Domestic' | 'Regional' | 'Worldwide';
  postalCode?: string;
  categoryId?: string;
}

export interface CompareEbayCandidatesOptions {
  db: PrismaClient;
  keepaApiKey: string;
  ruleConfig: ActiveRuleConfig;
  runId?: string;
  candidateIds?: string[];
  limit?: number;
  marketKey?: string;
  amazonMatchLimit?: number;
  force?: boolean;
}

export interface AmazonComparisonReport {
  status: 'OPPORTUNITY' | 'MANUAL_REVIEW' | 'REJECTED' | 'NO_AMAZON_RESULTS' | 'NO_PRICED_AMAZON_RESULTS' | 'ERROR';
  query: string;
  amazonResultCount: number;
  pricedResultCount: number;
  evaluatedCount: number;
  ebaySoldPrice?: number;
  market?: {
    key: string;
    label: string;
    currency: string;
    currencySymbol: string;
    amazonDomain: string;
    ebayDomain: string;
  };
  settings?: {
    amazonMatchLimit: number;
  };
  best?: {
    asin: string;
    title: string;
    url?: string;
    brand?: string;
    currentPrice?: number;
    buyBoxPrice?: number;
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
    asin: string;
    title: string;
    url?: string;
    brand?: string;
    currentPrice?: number;
    buyBoxPrice?: number;
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

export interface ConsiderEbayCandidateOptions {
  db: PrismaClient;
  candidateId: string;
  ruleConfig: ActiveRuleConfig;
  note?: string;
}

const money = (value: number | undefined): string | undefined => value === undefined ? undefined : value.toFixed(2);
const percent = (value: number | undefined): string => value === undefined ? 'unknown' : `${value.toFixed(1)}%`;
const dollars = (value: number | undefined): string => value === undefined ? 'unknown' : `$${value.toFixed(2)}`;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value);

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber();
  return undefined;
};

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

const normalizedIncludes = (value: string | undefined, patterns: string[]): string | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return patterns.find((pattern) => normalized.includes(pattern.toLowerCase()));
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizedKeywordIncludes = (value: string | undefined, patterns: string[]): string | undefined => {
  if (!value) return undefined;
  return patterns.find((pattern) => {
    const normalizedPattern = pattern.trim().toLowerCase();
    if (!normalizedPattern) return false;
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedPattern)}([^a-z0-9]|$)`, 'i').test(value);
  });
};

const conditionIdsBySetting: Record<NonNullable<EbayDiscoveryRunOptions['itemCondition']>, string[]> = {
  ANY: [],
  NEW: ['1000'],
  USED: ['3000'],
  OPEN_BOX: ['1500']
};

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

function ebayFromRecord(record: Record<string, unknown>): EbayCandidateInput {
  return {
    itemId: typeof record.ebayItemId === 'string' ? record.ebayItemId : undefined,
    title: String(record.title),
    url: typeof record.ebayUrl === 'string' ? record.ebayUrl : undefined,
    soldPrice: numberValue(record.soldPrice),
    shippingPrice: numberValue(record.shippingPrice),
    condition: typeof record.condition === 'string' ? record.condition : undefined,
    category: typeof record.category === 'string' ? record.category : undefined,
    categoryId: typeof record.categoryId === 'string' ? record.categoryId : undefined,
    raw: record.rawSerpapiJson
  };
}

function amazonFromSnapshot(best: NonNullable<AmazonComparisonReport['best']>): AmazonMatchInput {
  return {
    asin: best.asin,
    title: best.title,
    url: best.url,
    brand: best.brand,
    currentPrice: best.currentPrice,
    buyBoxPrice: best.buyBoxPrice,
    matchConfidence: best.matchConfidence ?? 0
  };
}

function evaluateEbayCandidateSafety(ebay: EbayCandidateInput, policy: SafetyPolicy): EbayDiscoveryCandidateResult['safety'] {
  const riskFlags: string[] = [];
  const reasons: string[] = [];
  const titleText = ebay.title;
  const categoryText = ebay.category;
  const listingRisks = ebayFixedNewListingRisks(ebay);
  riskFlags.push(...listingRisks.riskFlags);
  reasons.push(...listingRisks.reasons);

  const blockedCategory = normalizedIncludes(categoryText, policy.blockedCategories);
  if (blockedCategory) {
    riskFlags.push('BLOCKED_CATEGORY');
    reasons.push(`Blocked category: ${blockedCategory}`);
  }

  const blockedKeyword = normalizedKeywordIncludes(titleText, policy.blockedKeywords);
  if (blockedKeyword) {
    riskFlags.push('BLOCKED_KEYWORD');
    reasons.push(`Blocked keyword: ${blockedKeyword}`);
  }

  if (policy.safeMode && policy.allowedCategories.length > 0 && categoryText) {
    const allowedCategory = normalizedIncludes(categoryText, policy.allowedCategories);
    if (!allowedCategory) {
      riskFlags.push('OUTSIDE_ALLOWED_CATEGORY');
      reasons.push('eBay category is outside the safe-mode allow list.');
    }
  }

  if (!ebay.soldPrice) {
    riskFlags.push('MISSING_EBAY_PRICE');
    reasons.push('Missing eBay sold price.');
  }

  const status = riskFlags.some((flag) => ['BLOCKED_CATEGORY', 'BLOCKED_KEYWORD', 'MISSING_EBAY_PRICE', 'EBAY_NOT_NEW', 'EBAY_AUCTION_FORMAT'].includes(flag))
    ? 'REJECT'
    : riskFlags.length > 0 ? 'WARN' : 'PASS';
  return { status, riskFlags, reasons };
}

function scoreEbayDiscoveryCandidate(
  ebay: EbayCandidateInput,
  options: {
    minSoldPrice: number;
    maxSoldPrice: number;
  },
  riskFlags: string[]
): EbayDiscoveryScore {
  const reasons: string[] = [];
  const soldPrice = ebay.soldPrice ?? 0;
  const priceRange = Math.max(1, options.maxSoldPrice - options.minSoldPrice);
  let price = 0;
  const localRiskFlags = [...riskFlags];

  if (soldPrice >= options.minSoldPrice && soldPrice <= options.maxSoldPrice) {
    price = clamp(24 + ((soldPrice - options.minSoldPrice) / priceRange) * 18, 24, 42);
    reasons.push(`Sold price ${soldPrice.toFixed(2)} is inside the target range.`);
  } else if (soldPrice > options.maxSoldPrice) {
    price = 18;
    localRiskFlags.push('SOLD_PRICE_ABOVE_MAX');
    reasons.push(`Sold price ${soldPrice.toFixed(2)} is above the target max ${options.maxSoldPrice.toFixed(2)}.`);
  } else if (soldPrice > 0) {
    price = 10;
    localRiskFlags.push('SOLD_PRICE_BELOW_MIN');
    reasons.push(`Sold price ${soldPrice.toFixed(2)} is below the target min ${options.minSoldPrice.toFixed(2)}.`);
  }

  const conditionText = ebay.condition?.toLowerCase() ?? '';
  let condition = 10;
  if (/for parts|not working|damaged|defect/.test(conditionText)) {
    condition = 0;
    localRiskFlags.push('DAMAGED_OR_PARTS');
    reasons.push('Condition suggests parts, damage, or non-working inventory.');
  } else if (/new|open box|used|pre-owned|pre owned/.test(conditionText)) {
    condition = 16;
    reasons.push(`Condition signal: ${ebay.condition}.`);
  }

  const metadata = (ebay.itemId ? 8 : 0) + (ebay.url ? 6 : 0) + (ebay.title.length >= 12 ? 8 : 0);
  if (ebay.itemId || ebay.url) reasons.push('eBay listing metadata is available for review.');

  const category = ebay.category ? 12 : 3;
  if (ebay.category) reasons.push(`eBay category: ${ebay.category}.`);

  const riskPenalty = localRiskFlags.reduce((penalty, flag) => {
    if (['BLOCKED_CATEGORY', 'BLOCKED_KEYWORD'].includes(flag)) return penalty + 100;
    if (flag === 'MISSING_EBAY_PRICE') return penalty + 50;
    if (flag === 'DAMAGED_OR_PARTS') return penalty + 25;
    if (flag === 'SOLD_PRICE_BELOW_MIN') return penalty + 18;
    if (flag === 'SOLD_PRICE_ABOVE_MAX') return penalty + 10;
    if (flag === 'OUTSIDE_ALLOWED_CATEGORY') return penalty + 6;
    return penalty + 4;
  }, 0);

  return {
    total: round(clamp(price + condition + metadata + category - riskPenalty, 0, 100)),
    price: round(price),
    condition: round(condition),
    metadata: round(metadata),
    category: round(category),
    riskPenalty,
    reasons
  };
}

function ebayRejectionReasons(
  candidate: Omit<EbayDiscoveryCandidateResult, 'rejectionReasons'>,
  minimumEbayScore: number
): string[] {
  const reasons: string[] = [];
  if (candidate.safety.status === 'REJECT') reasons.push(...candidate.safety.reasons);
  if (candidate.score.total < minimumEbayScore) {
    reasons.push(`eBay score ${candidate.score.total} is below minimum ${minimumEbayScore}.`);
  }
  return [...new Set(reasons)];
}

export function selectEbayDiscoveryQueries(
  profile: ReturnType<typeof getEbayDiscoveryProfile>,
  category: ReturnType<typeof getEbayDiscoveryCategory>,
  query: string | undefined,
  limit: number
): string[] {
  const trimmed = query?.trim();
  if (trimmed) return [trimmed];

  const seeds = category.seedQueries.length > 0 ? category.seedQueries : [profile.label];
  const queryCount = Math.min(seeds.length, Math.max(1, Math.ceil(limit / 10)));
  return seeds.slice(0, queryCount);
}

export async function buildEbayDiscoveryCandidates(options: EbayDiscoveryRunOptions): Promise<{
  profile: ReturnType<typeof getEbayDiscoveryProfile>;
  category: ReturnType<typeof getEbayDiscoveryCategory>;
  queries: string[];
  candidates: EbayDiscoveryCandidateResult[];
  rejected: EbayDiscoveryCandidateResult[];
  filters: Record<string, unknown>;
}> {
  const profile = getEbayDiscoveryProfile(options.profileKey);
  const category = getEbayDiscoveryCategory(profile, options.categoryKey);
  const market = getEbayDiscoveryMarket(options.marketKey);
  const limit = Math.min(Math.max(options.limit ?? profile.defaultLimit, 1), 100);
  const safeMode = options.safeMode ?? options.ruleConfig.safeMode;
  const minimumEbayScore = options.minimumEbayScore ?? profile.minEbayScore;
  const minSoldPrice = options.minSoldPrice ?? profile.minSoldPrice;
  const maxSoldPrice = options.maxSoldPrice ?? profile.maxSoldPrice;
  const query = options.query?.trim();
  const queries = selectEbayDiscoveryQueries(profile, category, query, limit);
  const policy = safetyPolicy(options.ruleConfig, safeMode, options.ruleConfig.maxAmazonCostUsd);
  const itemCondition = options.itemCondition ?? 'NEW';
  const buyingFormat = options.buyingFormat ?? 'BIN';
  const preferredLocation = options.preferredLocation ?? 'Domestic';
  const categoryId = options.categoryId?.trim() || category.categoryId;
  const soldOnly = options.soldOnly ?? true;
  const completedOnly = options.completedOnly ?? true;

  const byKey = new Map<string, EbayCandidateInput>();
  for (const seed of queries) {
    const ebayCandidates = await searchEbayCandidates({
      query: seed,
      apiKey: options.serpApiKey,
      ebayDomain: market.ebayDomain,
      soldOnly,
      completedOnly,
      buyingFormat: buyingFormat === 'ANY' ? undefined : buyingFormat,
      conditionIds: conditionIdsBySetting[itemCondition],
      preferredLocation: preferredLocation === 'ANY' ? undefined : preferredLocation,
      postalCode: options.postalCode?.trim() || market.defaultPostalCode,
      categoryId,
      minPrice: minSoldPrice,
      maxPrice: maxSoldPrice,
      limit: Math.max(3, Math.ceil(limit / Math.max(queries.length, 1)))
    });

    for (const ebay of ebayCandidates) {
      const key = ebay.itemId ?? `${ebay.title.toLowerCase()}|${ebay.soldPrice ?? ''}`;
      if (!byKey.has(key)) byKey.set(key, ebay);
    }
  }

  const reviewed = [...byKey.values()].slice(0, limit).map((ebay) => {
    const safety = evaluateEbayCandidateSafety(ebay, policy);
    const score = scoreEbayDiscoveryCandidate(ebay, { minSoldPrice, maxSoldPrice }, safety.riskFlags);
    const base = { ebay, score, safety };
    return { ...base, rejectionReasons: ebayRejectionReasons(base, minimumEbayScore) };
  }).sort((a, b) => b.score.total - a.score.total);

  const candidates = reviewed.filter((candidate) => candidate.safety.status !== 'REJECT' && candidate.score.total >= minimumEbayScore);
  const rejected = reviewed.filter((candidate) => candidate.safety.status === 'REJECT' || candidate.score.total < minimumEbayScore);

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
      minimumEbayScore,
      minSoldPrice,
      maxSoldPrice,
      soldOnly,
      completedOnly,
      buyingFormat,
      itemCondition,
      preferredLocation,
      postalCode: options.postalCode?.trim() || market.defaultPostalCode,
      categoryId
    }
  };
}

export async function persistEbayDiscoveryRun(
  db: PrismaClient,
  options: EbayDiscoveryRunOptions,
  result: Awaited<ReturnType<typeof buildEbayDiscoveryCandidates>>
): Promise<unknown> {
  const transactionalDb = db as unknown as {
    $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  };
  return transactionalDb.$transaction(async (tx) => {
    const run = await tx.ebayDiscoveryRun.create({
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

    const persistCandidate = async (candidate: EbayDiscoveryCandidateResult, accepted: boolean): Promise<void> => {
      await tx.ebayDiscoveryCandidate.create({
        data: {
          runId: run.id,
          ebayItemId: candidate.ebay.itemId,
          title: candidate.ebay.title,
          ebayUrl: candidate.ebay.url,
          soldPrice: money(candidate.ebay.soldPrice),
          shippingPrice: money(candidate.ebay.shippingPrice),
          condition: candidate.ebay.condition,
          category: candidate.ebay.category,
          categoryId: candidate.ebay.categoryId,
          ebayScore: candidate.score.total,
          safetyStatus: candidate.safety.status,
          riskFlags: candidate.safety.riskFlags,
          scoreBreakdown: {
            ...candidate.score,
            rejectionReasons: candidate.rejectionReasons
          },
          selected: accepted && (options.mode ?? 'MANUAL') === 'AUTO',
          comparisonStatus: accepted ? 'NOT_COMPARED' : 'REJECTED',
          rawSerpapiJson: candidate.ebay.raw
        }
      });
    };

    for (const candidate of result.candidates) await persistCandidate(candidate, true);
    for (const candidate of result.rejected) await persistCandidate(candidate, false);

    return tx.ebayDiscoveryRun.findUnique({
      where: { id: run.id },
      include: { candidates: { orderBy: { ebayScore: 'desc' } } }
    });
  });
}

function searchQueryForEbayProduct(ebay: EbayCandidateInput): string {
  return ebay.title.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))];
}

function reportMarket(market: DiscoveryMarket): NonNullable<AmazonComparisonReport['market']> {
  return {
    key: market.key,
    label: market.label,
    currency: market.currency,
    currencySymbol: market.currencySymbol,
    amazonDomain: market.amazonDomain,
    ebayDomain: market.ebayDomain
  };
}

function reportSettings(amazonMatchLimit: number): NonNullable<AmazonComparisonReport['settings']> {
  return { amazonMatchLimit };
}

function comparisonSnapshot(opportunity: ProductOpportunity): NonNullable<AmazonComparisonReport['best']> {
  return {
    asin: opportunity.amazon.asin,
    title: opportunity.amazon.title,
    url: opportunity.amazon.url,
    brand: opportunity.amazon.brand,
    currentPrice: opportunity.amazon.currentPrice,
    buyBoxPrice: opportunity.amazon.buyBoxPrice,
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

function comparisonRejectionReasons(opportunity: ProductOpportunity, ruleConfig: ActiveRuleConfig): string[] {
  const amazonCost = opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice;
  const soldPrice = opportunity.ebay.soldPrice;
  const reasons: string[] = [];

  if (soldPrice !== undefined && amazonCost !== undefined && soldPrice <= amazonCost) {
    reasons.push(`eBay sold price ${dollars(soldPrice)} is not above Amazon cost ${dollars(amazonCost)} before fees, tax, and buffers.`);
  }
  if (opportunity.decision.riskFlags.includes('LOW_PROFIT')) {
    reasons.push(`Expected profit ${dollars(opportunity.profit.expectedProfit)} is below the ${dollars(ruleConfig.thresholds.minimumProfitUsd)} minimum.`);
  }
  if (opportunity.decision.riskFlags.includes('LOW_ROI')) {
    reasons.push(`ROI ${percent(opportunity.profit.roiPercent)} is below the ${percent(ruleConfig.thresholds.minimumRoiPercent)} target.`);
  }
  if (opportunity.decision.riskFlags.includes('LOW_MATCH_CONFIDENCE')) {
    reasons.push(`Best Amazon match confidence ${percent((opportunity.amazon.matchConfidence ?? 0) * 100)} is below the ${percent(ruleConfig.thresholds.minimumMatchConfidence * 100)} minimum, so it may not be the same product.`);
  }
  if (opportunity.decision.riskFlags.includes('PRODUCT_IDENTITY_CONFLICT')) {
    reasons.push(...(opportunity.identityMatch?.conflicts ?? ['Product identity conflicts were found.']));
  }
  if (opportunity.decision.riskFlags.includes('PRODUCT_IDENTITY_UNVERIFIED')) {
    reasons.push(...(opportunity.identityMatch?.conflicts ?? ['Exact product identity is not proven by brand plus model or identifier evidence.']));
  }
  if (opportunity.decision.riskFlags.includes('MISSING_EBAY_PRICE')) reasons.push('The eBay result did not include a usable sold price.');
  if (opportunity.decision.riskFlags.includes('MISSING_AMAZON_PRICE')) reasons.push('Amazon price is missing, so profit cannot be calculated safely.');
  if (opportunity.decision.riskFlags.includes('AMAZON_STOCK_UNKNOWN')) reasons.push('Amazon stock status is not confirmed as in stock.');
  if (opportunity.decision.riskFlags.includes('LOW_OPPORTUNITY_SCORE') && opportunity.score) {
    reasons.push(`Overall comparison score ${opportunity.score.total} is below the ${ruleConfig.minimumOpportunityScore} minimum after profit, ROI, demand, match, and risk scoring.`);
  }
  if (opportunity.safety?.reasons.length) reasons.push(...opportunity.safety.reasons);
  if (!reasons.length && opportunity.decision.reasoningSummary) reasons.push(opportunity.decision.reasoningSummary);

  return uniqueReasons(reasons);
}

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

function scoreAmazonCandidateForEbay(
  ebay: EbayCandidateInput,
  amazon: AmazonMatchInput,
  ruleConfig: ActiveRuleConfig
): ProductOpportunity {
  const matchConfidence = scoreAmazonMatch(ebay, amazon);
  const matchedAmazon = { ...amazon, matchConfidence };
  const identityMatch = evaluateProductIdentity(ebay, matchedAmazon);
  const amazonCost = matchedAmazon.buyBoxPrice ?? matchedAmazon.currentPrice;
  const emptyProfit = { estimatedFees: 0, estimatedTax: 0, bufferAmount: 0, expectedProfit: 0, roiPercent: 0, marginPercent: 0 };
  const profit = ebay.soldPrice && amazonCost
    ? calculateProfit({
      ebaySalePrice: ebay.soldPrice,
      amazonItemCost: amazonCost,
      ...profitInputsFromRuleConfig(ruleConfig)
    })
    : emptyProfit;
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
    discoveryProfile: 'ebay-first'
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

export function analyzeEbayAmazonComparison(
  ebay: EbayCandidateInput,
  amazonMatches: AmazonMatchInput[],
  ruleConfig: ActiveRuleConfig,
  query: string,
  context: {
    market?: DiscoveryMarket;
    amazonMatchLimit?: number;
  } = {}
): {
  best?: ProductOpportunity;
  report: AmazonComparisonReport;
} {
  const pricedResultCount = amazonMatches.filter((amazon) => (amazon.buyBoxPrice ?? amazon.currentPrice) !== undefined).length;
  const thresholds = {
    minimumProfitUsd: ruleConfig.thresholds.minimumProfitUsd,
    minimumRoiPercent: ruleConfig.thresholds.minimumRoiPercent,
    minimumMatchConfidence: ruleConfig.thresholds.minimumMatchConfidence,
    minimumOpportunityScore: ruleConfig.minimumOpportunityScore
  };
  const baseReport = {
    query,
    amazonResultCount: amazonMatches.length,
    pricedResultCount,
    ebaySoldPrice: ebay.soldPrice,
    market: context.market ? reportMarket(context.market) : undefined,
    settings: reportSettings(context.amazonMatchLimit ?? amazonMatches.length),
    thresholds,
    comparedAt: new Date().toISOString()
  };

  if (amazonMatches.length === 0) {
    return {
      report: {
        ...baseReport,
        status: 'NO_AMAZON_RESULTS',
        evaluatedCount: 0,
        topMatches: [],
        reasons: ['No Amazon matches were found for this eBay sold listing.']
      }
    };
  }

  const scored = amazonMatches
    .map((amazon) => scoreAmazonCandidateForEbay(ebay, amazon, ruleConfig))
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  const marketMetrics = calculateEbayMarketMetrics({
    soldCandidates: [ebay],
    targetPrice: ebay.soldPrice,
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
        status: pricedResultCount === 0 ? 'NO_PRICED_AMAZON_RESULTS' : 'REJECTED',
        evaluatedCount: 0,
        topMatches: [],
        reasons: pricedResultCount === 0
          ? ['Amazon returned matches, but none included a usable source price.']
          : ['No Amazon match could be evaluated against the eBay sold price.']
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
      `Best Amazon source price ${dollars(best.amazon.buyBoxPrice ?? best.amazon.currentPrice)} leaves ${dollars(best.profit.expectedProfit)} expected profit.`,
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

function scoreBreakdownWithComparison(existing: unknown, report: AmazonComparisonReport): Record<string, unknown> {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};
  return jsonReady({ ...base, amazonComparison: report }) as Record<string, unknown>;
}

function amazonComparisonFromScoreBreakdown(existing: unknown): AmazonComparisonReport | undefined {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return undefined;
  const comparison = (existing as Record<string, unknown>).amazonComparison;
  return comparison && typeof comparison === 'object' && !Array.isArray(comparison)
    ? comparison as AmazonComparisonReport
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

export async function compareEbayDiscoveryCandidates(options: CompareEbayCandidatesOptions): Promise<{
  compared: number;
  opportunities: ProductOpportunity[];
  manualReviews: ProductOpportunity[];
  rejected: ProductOpportunity[];
  reports: AmazonComparisonReport[];
}> {
  const market = getEbayDiscoveryMarket(options.marketKey);
  const amazonMatchLimit = Math.min(Math.max(options.amazonMatchLimit ?? 3, 1), 10);
  const allowedStatuses = options.force
    ? ['NOT_COMPARED', 'ERROR', 'REJECTED', 'MANUAL_REVIEW']
    : ['NOT_COMPARED', 'ERROR'];
  const where = options.candidateIds?.length
    ? { id: { in: options.candidateIds } }
    : {
      runId: options.runId,
      selected: true
    };
  const candidates = await options.db.ebayDiscoveryCandidate.findMany({
    where: {
      ...where,
      comparisonStatus: { in: allowedStatuses }
    },
    orderBy: { ebayScore: 'desc' },
    take: options.limit ?? 25
  });

  const opportunities: ProductOpportunity[] = [];
  const manualReviews: ProductOpportunity[] = [];
  const rejected: ProductOpportunity[] = [];
  const reports: AmazonComparisonReport[] = [];

  for (const candidate of candidates) {
    const ebay = ebayFromRecord(candidate as Record<string, unknown>);
    await options.db.ebayDiscoveryCandidate.update({ where: { id: candidate.id }, data: { selected: true, comparisonStatus: 'COMPARING' } });
    try {
      const query = searchQueryForEbayProduct(ebay);
      const amazonMatches = await findAmazonMatches({
        query,
        apiKey: options.keepaApiKey,
        domain: market.amazonDomainId,
        limit: amazonMatchLimit
      });
      const comparison = analyzeEbayAmazonComparison(ebay, amazonMatches, options.ruleConfig, query, {
        market,
        amazonMatchLimit
      });
      reports.push(comparison.report);
      const best = comparison.best;
      if (!best) {
        await options.db.ebayDiscoveryCandidate.update({
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
        await options.db.ebayDiscoveryCandidate.update({
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
        await options.db.ebayDiscoveryCandidate.update({
          where: { id: candidate.id },
          data: {
            comparisonStatus: 'REJECTED',
            scoreBreakdown: scoreBreakdownWithComparison(candidate.scoreBreakdown, comparison.report)
          }
        });
        continue;
      }

      const persisted = await persistOpportunity(options.db, best, {
        discoveryProfile: 'ebay-first',
        ebayCandidateId: candidate.id,
        source: 'ebay-discovery'
      });
      opportunities.push(best);
      await options.db.ebayDiscoveryCandidate.update({
        where: { id: candidate.id },
        data: {
          comparisonStatus: 'OPPORTUNITY',
          productCandidateId: persisted.productCandidateId,
          amazonMatchId: persisted.amazonMatchId,
          scoreBreakdown: scoreBreakdownWithComparison(candidate.scoreBreakdown, comparison.report)
        }
      });
    } catch (error) {
      const report: AmazonComparisonReport = {
        status: 'ERROR',
        query: searchQueryForEbayProduct(ebay),
        amazonResultCount: 0,
        pricedResultCount: 0,
        evaluatedCount: 0,
        ebaySoldPrice: ebay.soldPrice,
        topMatches: [],
        reasons: [error instanceof Error ? error.message : 'Amazon comparison failed.'],
        thresholds: {
          minimumProfitUsd: options.ruleConfig.thresholds.minimumProfitUsd,
          minimumRoiPercent: options.ruleConfig.thresholds.minimumRoiPercent,
          minimumMatchConfidence: options.ruleConfig.thresholds.minimumMatchConfidence,
          minimumOpportunityScore: options.ruleConfig.minimumOpportunityScore
        },
        market: reportMarket(market),
        settings: reportSettings(amazonMatchLimit),
        comparedAt: new Date().toISOString()
      };
      await options.db.ebayDiscoveryCandidate.update({
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
    await options.db.ebayDiscoveryRun.update({
      where: { id: options.runId },
      data: {
        comparedCount: { increment: candidates.length },
        opportunityCount: { increment: opportunities.length }
      }
    });
  }

  return { compared: candidates.length, opportunities, manualReviews, rejected, reports };
}

export async function considerEbayDiscoveryCandidate(options: ConsiderEbayCandidateOptions): Promise<{
  candidateId: string;
  productCandidateId: string;
  amazonMatchId?: string;
  actionItemId?: string;
  alreadyConsidered: boolean;
}> {
  const candidate = await options.db.ebayDiscoveryCandidate.findUnique({ where: { id: options.candidateId } });
  if (!candidate) throw notFound('eBay discovery candidate not found', 'EBAY_DISCOVERY_CANDIDATE_NOT_FOUND');
  if (candidate.productCandidateId) {
    return {
      candidateId: candidate.id,
      productCandidateId: candidate.productCandidateId,
      amazonMatchId: candidate.amazonMatchId ?? undefined,
      alreadyConsidered: true
    };
  }

  const report = amazonComparisonFromScoreBreakdown(candidate.scoreBreakdown);
  const ebay = ebayFromRecord(candidate as Record<string, unknown>);
  const best = report?.best;
  const review = {
    note: options.note?.trim() || undefined,
    forcedAt: new Date().toISOString(),
    originalStatus: candidate.comparisonStatus,
    reasons: report?.reasons ?? ['User asked to manually review this eBay candidate.']
  };
  const candidateRiskFlags = stringArray(candidate.riskFlags);
  const riskFlags = uniqueReasons(['USER_OVERRIDE', ...(best?.riskFlags ?? []), ...candidateRiskFlags]);
  const reasoningSummary = `Manual review requested from eBay Discovery. ${report?.reasons?.[0] ?? 'Verify eBay and Amazon fit before listing.'}`;

  if (best?.asin && best.title && ebay.soldPrice !== undefined && (best.buyBoxPrice ?? best.currentPrice) !== undefined) {
    const amazon = amazonFromSnapshot(best);
    const profit = calculateProfit({
      ebaySalePrice: ebay.soldPrice,
      amazonItemCost: amazon.buyBoxPrice ?? amazon.currentPrice ?? 0,
      ...profitInputsFromRuleConfig(options.ruleConfig)
    });
    const opportunity: ProductOpportunity = {
      ebay,
      amazon,
      profit,
      decision: {
        decision: 'MANUAL_REVIEW',
        confidence: 0.55,
        riskFlags,
        reasoningSummary,
        recommendedPrice: ebay.soldPrice,
        recommendedTitle: ebay.title.slice(0, 80),
        recommendedDescription: `Manual review candidate from eBay Discovery. Confirm Amazon ASIN ${amazon.asin} and marketplace fit before listing.`
      },
      score: {
        total: best.opportunityScore ?? candidate.ebayScore,
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
      discoveryProfile: 'ebay-manual-review'
    };
    opportunity.evidence = buildOpportunityEvidence(opportunity);

    const persisted = await persistOpportunity(options.db, opportunity, {
      discoveryProfile: 'ebay-manual-review',
      ebayCandidateId: candidate.id,
      source: 'ebay-manual-review'
    });
    await options.db.productCandidate.update({
      where: { id: persisted.productCandidateId },
      data: {
        source: 'ebay-manual-review',
        scoreBreakdown: scoreBreakdownWithManualReview(
          { ...(opportunity.score ?? {}), amazonComparison: report },
          review
        )
      }
    });
    await options.db.ebayDiscoveryCandidate.update({
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
      ebayCandidateId: candidate.id,
      discoveryProfile: 'ebay-manual-review',
      opportunityScore: candidate.ebayScore,
      safetyStatus: 'WARN',
      riskFlags,
      scoreBreakdown: scoreBreakdownWithManualReview(candidate.scoreBreakdown, review),
      evidenceJson: best ? jsonReady({
        productIdentity: best.identityMatch?.evidence ?? [],
        safety: riskFlags
      }) : undefined,
      marketMetricsJson: best?.marketMetrics ? jsonReady(best.marketMetrics) : undefined,
      source: 'ebay-manual-review',
      ebayTitle: ebay.title,
      ebayUrl: ebay.url,
      ebaySoldPrice: money(ebay.soldPrice),
      ebayShippingPrice: money(ebay.shippingPrice),
      ebayCondition: ebay.condition,
      ebayCategory: ebay.category,
      rawSerpapiJson: report ?? ebay.raw
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
      entityType: 'EbayDiscoveryCandidate',
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
  await options.db.ebayDiscoveryCandidate.update({
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
