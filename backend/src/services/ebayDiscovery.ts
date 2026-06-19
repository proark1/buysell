import type { PrismaClient } from '@prisma/client';
import type { AmazonMatchInput, EbayCandidateInput, ProductOpportunity } from '../domain/products.js';
import { findAmazonMatches } from '../clients/keepaClient.js';
import { searchEbayCandidates, SerpApiError } from '../clients/serpApiClient.js';
import { createActionForDecision } from '../repositories/actionRepository.js';
import { recordDiscoveryCandidateLearning } from '../repositories/learningRepository.js';
import { persistOpportunity } from '../repositories/opportunityRepository.js';
import type { ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { calculateProfit } from './profitCalculator.js';
import { decideOpportunity } from './opportunityDecider.js';
import {
  ebayFixedNewListingRisks,
  evaluateProductSafety,
  getEbayDiscoveryCategory,
  getEbayDiscoveryProfile,
  hardSafetyRejectFlags,
  rejectionStageForFlag,
  type SafetyPolicy
} from './discoveryPolicy.js';
import { scoreAmazonMatch } from './matchScorer.js';
import { getEbayDiscoveryMarket, type DiscoveryMarket } from './marketplaces.js';
import { scoreOpportunity } from './opportunityScorer.js';
import { applyIdentityDecision, evaluateProductIdentity, extractEbayIdentityFingerprint } from './productIdentityMatcher.js';
import { notFound } from '../security/httpErrors.js';
import { profitInputsFromRuleConfig } from './profitInputs.js';
import { buildOpportunityEvidence } from './opportunityEvidence.js';
import { calculateEbayMarketMetrics } from './marketMetrics.js';
import { productFamilyKeyForEbayCandidate } from './productFamily.js';
import {
  emptyEbaySourceDropStats,
  filterEbaySourceCandidates,
  mergeEbaySourceDropStats,
  type EbaySourceDropReason,
  type EbaySourceDropStats
} from './ebaySourceFilters.js';

export { productFamilyKeyForEbayCandidate } from './productFamily.js';

export interface EbayDiscoveryScore {
  total: number;
  price: number;
  condition: number;
  metadata: number;
  category: number;
  diversity: number;
  riskPenalty: number;
  reasons: string[];
}

export interface EbayDiscoveryFamilySummary {
  key: string;
  sourceQuery?: string;
  soldCount: number;
  minSoldPrice?: number;
  medianSoldPrice?: number;
  maxSoldPrice?: number;
  duplicateItemCount: number;
}

export interface EbayDiscoveryCandidateResult {
  ebay: EbayCandidateInput;
  family: EbayDiscoveryFamilySummary;
  score: EbayDiscoveryScore;
  safety: {
    status: 'PASS' | 'WARN' | 'REJECT';
    riskFlags: string[];
    reasons: string[];
  };
  rejectionReasons: string[];
}

export type EbayDiscoveryQueryBreadth = 'FOCUSED' | 'BALANCED' | 'WIDE';

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
  queryBreadth?: EbayDiscoveryQueryBreadth;
  queryOffset?: number;
  skipExistingProducts?: boolean;
  existingProductFamilyKeys?: Iterable<string>;
  existingEbayItemIds?: Iterable<string>;
}

export interface CompareEbayCandidatesOptions {
  db: PrismaClient;
  keepaApiKey: string;
  serpApiKey?: string;
  ruleConfig: ActiveRuleConfig;
  runId?: string;
  candidateIds?: string[];
  limit?: number;
  marketKey?: string;
  amazonMatchLimit?: number;
  force?: boolean;
}

export interface AmazonComparisonReport {
  status: 'OPPORTUNITY' | 'MANUAL_REVIEW' | 'REJECTED' | 'SKIPPED_EBAY_SOURCE_FORMAT' | 'SKIPPED_EBAY_SOURCE_DATA' | 'NO_AMAZON_RESULTS' | 'NO_PRICED_AMAZON_RESULTS' | 'ERROR';
  query: string;
  amazonResultCount: number;
  pricedResultCount: number;
  evaluatedCount: number;
  ebaySoldPrice?: number;
  sourceDrops?: EbaySourceDropStats;
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

const median = (values: number[]): number | undefined => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const asSet = (values: Iterable<string> | undefined): Set<string> => new Set(
  [...(values ?? [])].map((value) => value.trim()).filter(Boolean)
);

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

  if (!ebay.soldPrice) {
    riskFlags.push('MISSING_EBAY_PRICE');
    reasons.push('Missing eBay sold price.');
  }

  const status = riskFlags.includes('MISSING_EBAY_PRICE') || hardSafetyRejectFlags(riskFlags).length > 0
    ? 'REJECT'
    : riskFlags.length > 0 ? 'WARN' : 'PASS';
  return { status, riskFlags, reasons };
}

function scoreEbayDiscoveryCandidate(
  ebay: EbayCandidateInput,
  options: {
    minSoldPrice: number;
    maxSoldPrice: number;
    family?: EbayDiscoveryFamilySummary;
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

  const family = options.family;
  const soldCount = family?.soldCount ?? 1;
  const diversity = soldCount >= 5
    ? 10
    : soldCount >= 3
      ? 8
      : soldCount >= 2
        ? 5
        : 0;
  if (soldCount > 1) reasons.push(`${soldCount} sold comps were grouped into one product family.`);
  if (family?.medianSoldPrice !== undefined && family.minSoldPrice !== undefined && family.maxSoldPrice !== undefined) {
    const spread = family.maxSoldPrice - family.minSoldPrice;
    const spreadPercent = family.medianSoldPrice > 0 ? spread / family.medianSoldPrice : 0;
    if (spreadPercent <= 0.25 && soldCount >= 2) {
      reasons.push('Sold prices are reasonably consistent across this product family.');
    }
  }

  const riskPenalty = localRiskFlags.reduce((penalty, flag) => {
    if (['BLOCKED_CATEGORY', 'BLOCKED_KEYWORD'].includes(flag)) return penalty + 100;
    if (flag === 'MISSING_EBAY_PRICE') return penalty + 50;
    if (flag === 'DAMAGED_OR_PARTS') return penalty + 25;
    if (flag === 'SOLD_PRICE_BELOW_MIN') return penalty + 18;
    if (flag === 'SOLD_PRICE_ABOVE_MAX') return penalty + 10;
    if (flag === 'OUTSIDE_ALLOWED_CATEGORY' || flag === 'CATEGORY_UNKNOWN') return penalty;
    return penalty + 4;
  }, 0);

  return {
    total: round(clamp(price + condition + metadata + category + diversity - riskPenalty, 0, 100)),
    price: round(price),
    condition: round(condition),
    metadata: round(metadata),
    category: round(category),
    diversity: round(diversity),
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

function sourceDropCandidateResult(
  ebay: EbayCandidateInput,
  sourceQuery: string,
  reason: EbaySourceDropReason,
  policy: SafetyPolicy,
  minSoldPrice: number,
  maxSoldPrice: number,
  minimumEbayScore: number
): EbayDiscoveryCandidateResult {
  const family: EbayDiscoveryFamilySummary = {
    key: productFamilyKeyForEbayCandidate(ebay),
    sourceQuery,
    soldCount: 1,
    minSoldPrice: ebay.soldPrice,
    medianSoldPrice: ebay.soldPrice,
    maxSoldPrice: ebay.soldPrice,
    duplicateItemCount: 0
  };
  const safety = evaluateEbayCandidateSafety(ebay, policy);
  const score = scoreEbayDiscoveryCandidate(ebay, { minSoldPrice, maxSoldPrice, family }, safety.riskFlags);
  const base = { ebay, family, score, safety };
  const fallbackReason = reason === 'MISSING_SOLD_PRICE'
    ? 'Dropped before scoring because SerpAPI/eBay did not provide a usable sold price.'
    : reason === 'AUCTION_FORMAT'
      ? 'Dropped before scoring because the sold source row looks like an auction or bidding listing.'
      : 'Dropped before scoring because the sold source row does not look like a new fixed-price listing.';
  return {
    ...base,
    rejectionReasons: [...new Set([...ebayRejectionReasons(base, minimumEbayScore), fallbackReason])]
  };
}

function rejectionDiagnostics(riskFlags: string[], reasons: string[]): Record<string, unknown> {
  const stages = riskFlags.reduce<Record<string, number>>((counts, flag) => {
    const stage = rejectionStageForFlag(flag);
    counts[stage] = (counts[stage] ?? 0) + 1;
    return counts;
  }, {});
  return {
    riskFlagStages: stages,
    sourceDataFlags: riskFlags.filter((flag) => rejectionStageForFlag(flag) === 'SOURCE_DATA'),
    sourceFormatFlags: riskFlags.filter((flag) => rejectionStageForFlag(flag) === 'SOURCE_FORMAT'),
    safetyFlags: riskFlags.filter((flag) => rejectionStageForFlag(flag) === 'SAFETY'),
    matchingFlags: riskFlags.filter((flag) => rejectionStageForFlag(flag) === 'MATCHING'),
    sourceCostFlags: riskFlags.filter((flag) => rejectionStageForFlag(flag) === 'SOURCE_COST'),
    diagnostics: reasons
  };
}

export function selectEbayDiscoveryQueries(
  profile: ReturnType<typeof getEbayDiscoveryProfile>,
  category: ReturnType<typeof getEbayDiscoveryCategory>,
  query: string | undefined,
  limit: number,
  breadth: EbayDiscoveryQueryBreadth = 'BALANCED',
  offset = 0
): string[] {
  const trimmed = query?.trim();
  if (trimmed) {
    const manualQueries = trimmed
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return manualQueries.length > 0 ? manualQueries : [trimmed];
  }

  const seeds = category.seedQueries.length > 0 ? category.seedQueries : [profile.label];
  const queryCount = breadth === 'WIDE'
    ? Math.min(seeds.length, Math.max(2, Math.ceil(limit / 5)))
    : breadth === 'FOCUSED'
      ? 1
      : Math.min(seeds.length, Math.max(1, Math.ceil(limit / 10)));
  const normalizedOffset = seeds.length > 0 ? Math.abs(offset) % seeds.length : 0;
  const rotated = [...seeds.slice(normalizedOffset), ...seeds.slice(0, normalizedOffset)];
  return rotated.slice(0, queryCount);
}

export async function loadExistingEbayDiscoveryKeys(db: PrismaClient, take = 10_000): Promise<{
  productFamilyKeys: string[];
  ebayItemIds: string[];
}> {
  const [families, items, products] = await Promise.all([
    db.ebayDiscoveryCandidate.findMany({
      where: { productFamilyKey: { not: null } },
      select: { productFamilyKey: true },
      distinct: ['productFamilyKey'],
      take
    }),
    db.ebayDiscoveryCandidate.findMany({
      where: { ebayItemId: { not: null } },
      select: { ebayItemId: true },
      distinct: ['ebayItemId'],
      take
    }),
    db.productCandidate.findMany({
      select: { ebayTitle: true },
      take
    })
  ]);
  const familyRows = families as Array<{ productFamilyKey: string | null }>;
  const itemRows = items as Array<{ ebayItemId: string | null }>;
  const productRows = products as Array<{ ebayTitle: string }>;
  const productFamilyKeys = productRows
    .map((item) => productFamilyKeyForEbayCandidate({ title: item.ebayTitle }))
    .filter(Boolean);

  return {
    productFamilyKeys: [...new Set([
      ...familyRows.map((item) => item.productFamilyKey).filter((item): item is string => Boolean(item)),
      ...productFamilyKeys
    ])],
    ebayItemIds: itemRows.map((item) => item.ebayItemId).filter((item): item is string => Boolean(item))
  };
}

export async function buildEbayDiscoveryCandidates(options: EbayDiscoveryRunOptions): Promise<{
  profile: ReturnType<typeof getEbayDiscoveryProfile>;
  category: ReturnType<typeof getEbayDiscoveryCategory>;
  queries: string[];
  candidates: EbayDiscoveryCandidateResult[];
  rejected: EbayDiscoveryCandidateResult[];
  sourceDropCandidates: EbayDiscoveryCandidateResult[];
  sourceDrops: EbaySourceDropStats;
  skippedExisting: number;
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
  const queryBreadth = options.queryBreadth ?? 'BALANCED';
  const queries = selectEbayDiscoveryQueries(profile, category, query, limit, queryBreadth, options.queryOffset ?? 0);
  const policy = safetyPolicy(options.ruleConfig, safeMode, options.ruleConfig.maxAmazonCostUsd);
  const itemCondition = options.itemCondition ?? 'NEW';
  const buyingFormat = options.buyingFormat ?? 'BIN';
  const preferredLocation = options.preferredLocation ?? 'Domestic';
  const categoryId = options.categoryId?.trim() || category.categoryId;
  const soldOnly = options.soldOnly ?? true;
  const completedOnly = options.completedOnly ?? true;
  const skipExistingProducts = options.skipExistingProducts ?? true;
  const existingFamilyKeys = asSet(options.existingProductFamilyKeys);
  const existingItemIds = asSet(options.existingEbayItemIds);
  const rawResultMultiplier = queryBreadth === 'WIDE' ? 4 : queryBreadth === 'BALANCED' ? 3 : 2;
  const sourceDrops = emptyEbaySourceDropStats();
  const sourceDropCandidates: EbayDiscoveryCandidateResult[] = [];

  const byKey = new Map<string, { ebay: EbayCandidateInput; sourceQuery: string }>();
  for (const seed of queries) {
    const rawEbayCandidates = await searchEbayCandidates({
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
      limit: Math.max(5, Math.ceil((limit * rawResultMultiplier) / Math.max(queries.length, 1)))
    });
    const ebaySource = filterEbaySourceCandidates(rawEbayCandidates, seed);
    mergeEbaySourceDropStats(sourceDrops, ebaySource.dropped);
    sourceDropCandidates.push(...ebaySource.droppedCandidates.map((item) => sourceDropCandidateResult(
      item.candidate,
      seed,
      item.reason,
      policy,
      minSoldPrice,
      maxSoldPrice,
      minimumEbayScore
    )));

    for (const ebay of ebaySource.candidates) {
      const key = ebay.itemId ?? `${ebay.title.toLowerCase()}|${ebay.soldPrice ?? ''}`;
      if (!byKey.has(key)) byKey.set(key, { ebay, sourceQuery: seed });
    }
  }

  const families = new Map<string, Array<{ ebay: EbayCandidateInput; sourceQuery: string }>>();
  for (const item of byKey.values()) {
    const familyKey = productFamilyKeyForEbayCandidate(item.ebay);
    const family = families.get(familyKey) ?? [];
    family.push(item);
    families.set(familyKey, family);
  }

  let skippedExisting = 0;
  const reviewed = [...families.entries()].flatMap(([familyKey, familyItems]) => {
    const duplicateByFamily = skipExistingProducts && existingFamilyKeys.has(familyKey);
    const duplicateByItem = skipExistingProducts && familyItems.some((item) => item.ebay.itemId && existingItemIds.has(item.ebay.itemId));
    if (duplicateByFamily || duplicateByItem) {
      skippedExisting += familyItems.length;
      return [];
    }

    const soldPrices = familyItems.map((item) => item.ebay.soldPrice).filter((value): value is number => value !== undefined);
    const family: EbayDiscoveryFamilySummary = {
      key: familyKey,
      sourceQuery: familyItems[0]?.sourceQuery,
      soldCount: familyItems.length,
      minSoldPrice: soldPrices.length ? Math.min(...soldPrices) : undefined,
      medianSoldPrice: median(soldPrices),
      maxSoldPrice: soldPrices.length ? Math.max(...soldPrices) : undefined,
      duplicateItemCount: Math.max(0, familyItems.length - 1)
    };

    const familyReviewed = familyItems.map((item) => {
      const safety = evaluateEbayCandidateSafety(item.ebay, policy);
      const score = scoreEbayDiscoveryCandidate(item.ebay, { minSoldPrice, maxSoldPrice, family }, safety.riskFlags);
      const base = { ebay: item.ebay, family: { ...family, sourceQuery: item.sourceQuery }, score, safety };
      return { ...base, rejectionReasons: ebayRejectionReasons(base, minimumEbayScore) };
    }).sort((a, b) => b.score.total - a.score.total);

    return familyReviewed[0] ? [familyReviewed[0]] : [];
  }).sort((a, b) => b.score.total - a.score.total).slice(0, limit);

  const candidates = reviewed.filter((candidate) => candidate.safety.status !== 'REJECT' && candidate.score.total >= minimumEbayScore);
  const rejected = reviewed.filter((candidate) => candidate.safety.status === 'REJECT' || candidate.score.total < minimumEbayScore);

  return {
    profile,
    category,
    queries,
    candidates,
    rejected,
    sourceDropCandidates,
    sourceDrops,
    skippedExisting,
    filters: {
      profileKey: profile.key,
      categoryKey: category.key,
      marketKey: market.key,
      market,
      query,
      queries,
      queryBreadth,
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
      categoryId,
      skipExistingProducts,
      skippedExisting,
      sourceDropCandidateCount: sourceDropCandidates.length,
      sourceDrops
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
        scannedCount: result.candidates.length + result.rejected.length + result.sourceDrops.total,
        acceptedCount: result.candidates.length,
        rejectedCount: result.rejected.length + result.sourceDropCandidates.length,
        completedAt: new Date()
      }
    });

    const persistCandidate = async (candidate: EbayDiscoveryCandidateResult, accepted: boolean): Promise<void> => {
      const persisted = await tx.ebayDiscoveryCandidate.create({
        data: {
          runId: run.id,
          ebayItemId: candidate.ebay.itemId,
          productFamilyKey: candidate.family.key,
          sourceQuery: candidate.family.sourceQuery,
          title: candidate.ebay.title,
          ebayUrl: candidate.ebay.url,
          soldPrice: money(candidate.ebay.soldPrice),
          shippingPrice: money(candidate.ebay.shippingPrice),
          condition: candidate.ebay.condition,
          category: candidate.ebay.category,
          categoryId: candidate.ebay.categoryId,
          familySoldCount: candidate.family.soldCount,
          familyMinSoldPrice: money(candidate.family.minSoldPrice),
          familyMedianSoldPrice: money(candidate.family.medianSoldPrice),
          familyMaxSoldPrice: money(candidate.family.maxSoldPrice),
          ebayScore: candidate.score.total,
          safetyStatus: candidate.safety.status,
          riskFlags: candidate.safety.riskFlags,
          scoreBreakdown: {
            ...candidate.score,
            family: candidate.family,
            rejectionReasons: candidate.rejectionReasons,
            ...rejectionDiagnostics(candidate.safety.riskFlags, candidate.safety.reasons)
          },
          selected: accepted && (options.mode ?? 'MANUAL') === 'AUTO',
          comparisonStatus: accepted ? 'NOT_COMPARED' : 'REJECTED',
          rawSerpapiJson: candidate.ebay.raw
        }
      });
      if (!accepted) {
        await recordDiscoveryCandidateLearning(tx, {
          marketplace: 'EBAY',
          title: candidate.ebay.title,
          familyKey: candidate.family.key,
          ebayCandidateId: persisted.id,
          source: 'ebay-discovery',
          accepted,
          score: candidate.score.total,
          riskFlags: candidate.safety.riskFlags,
          rejectionReasons: candidate.rejectionReasons,
          metadata: {
            family: candidate.family,
            score: candidate.score,
            safety: candidate.safety
          }
        });
      }
    };

    for (const candidate of result.candidates) await persistCandidate(candidate, true);
    for (const candidate of result.rejected) await persistCandidate(candidate, false);
    for (const candidate of result.sourceDropCandidates) await persistCandidate(candidate, false);

    return tx.ebayDiscoveryRun.findUnique({
      where: { id: run.id },
      include: { candidates: { orderBy: { ebayScore: 'desc' } } }
    });
  });
}

function cleanTitleSearchQuery(ebay: EbayCandidateInput): string {
  return ebay.title.replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function amazonSearchQueriesForEbayProduct(ebay: EbayCandidateInput): string[] {
  const fingerprint = extractEbayIdentityFingerprint(ebay);
  return fingerprint.searchQueries.length ? fingerprint.searchQueries : [cleanTitleSearchQuery(ebay)];
}

function searchQueryForEbayProduct(ebay: EbayCandidateInput): string {
  return amazonSearchQueriesForEbayProduct(ebay)[0] ?? cleanTitleSearchQuery(ebay);
}

async function findAmazonMatchesForEbayProduct(options: {
  ebay: EbayCandidateInput;
  apiKey: string;
  domain: number;
  limit: number;
}): Promise<{
  matches: AmazonMatchInput[];
  queries: string[];
  usedQueries: string[];
}> {
  const queries = amazonSearchQueriesForEbayProduct(options.ebay);
  const matchesByAsin = new Map<string, AmazonMatchInput>();
  const usedQueries: string[] = [];

  for (const query of queries) {
    usedQueries.push(query);
    const matches = await findAmazonMatches({
      query,
      apiKey: options.apiKey,
      domain: options.domain,
      limit: options.limit
    });
    for (const match of matches) {
      if (!matchesByAsin.has(match.asin)) matchesByAsin.set(match.asin, match);
    }

    // If an identifier/brand-model query produced matches, avoid broad title fallback
    // that tends to introduce cheap but unrelated products.
    if (matches.length > 0 && query !== queries[queries.length - 1]) break;
  }

  return {
    matches: [...matchesByAsin.values()].slice(0, options.limit),
    queries,
    usedQueries
  };
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

function skippedSourceReport(
  ebay: EbayCandidateInput,
  query: string,
  market: DiscoveryMarket,
  amazonMatchLimit: number,
  ruleConfig: ActiveRuleConfig,
  sourceDrops: EbaySourceDropStats
): AmazonComparisonReport {
  const firstReason = sourceDrops.examples[0]?.reason;
  const sourceFormat = firstReason === 'AUCTION_FORMAT' || firstReason === 'NON_NEW_CONDITION';
  const reason = firstReason === 'AUCTION_FORMAT'
    ? 'eBay source row is an auction or bidding listing, so Amazon comparison was skipped.'
    : firstReason === 'MISSING_SOLD_PRICE'
      ? 'eBay source row has no usable sold price, so Amazon comparison was skipped.'
      : 'eBay source row is not a new fixed-price sold listing, so Amazon comparison was skipped.';
  return {
    status: sourceFormat ? 'SKIPPED_EBAY_SOURCE_FORMAT' : 'SKIPPED_EBAY_SOURCE_DATA',
    query,
    amazonResultCount: 0,
    pricedResultCount: 0,
    evaluatedCount: 0,
    ebaySoldPrice: ebay.soldPrice,
    market: reportMarket(market),
    settings: reportSettings(amazonMatchLimit),
    thresholds: {
      minimumProfitUsd: ruleConfig.thresholds.minimumProfitUsd,
      minimumRoiPercent: ruleConfig.thresholds.minimumRoiPercent,
      minimumMatchConfidence: ruleConfig.thresholds.minimumMatchConfidence,
      minimumOpportunityScore: ruleConfig.minimumOpportunityScore
    },
    sourceDrops,
    topMatches: [],
    reasons: [reason],
    comparedAt: new Date().toISOString()
  };
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
  if (opportunity.decision.riskFlags.includes('AMAZON_COST_ABOVE_PROFILE')) reasons.push('Amazon source price is above the profile budget, but profit may justify manual review.');
  if (opportunity.decision.riskFlags.includes('AMAZON_OUT_OF_STOCK')) reasons.push('Amazon source appears out of stock.');
  if (opportunity.decision.riskFlags.includes('AMAZON_STOCK_UNKNOWN')) reasons.push('Amazon stock status is unknown; verify live availability before listing.');
  if (opportunity.decision.riskFlags.includes('CATEGORY_UNKNOWN')) reasons.push('Marketplace category is missing, so safe-mode category fit needs review.');
  if (opportunity.decision.riskFlags.includes('LOW_OPPORTUNITY_SCORE') && opportunity.score) {
    reasons.push(`Overall comparison score ${opportunity.score.total} is below the ${ruleConfig.minimumOpportunityScore} minimum after profit, ROI, demand, match, and risk scoring.`);
  }
  if (opportunity.safety?.reasons.length) reasons.push(...opportunity.safety.reasons);
  if (!reasons.length && opportunity.decision.reasoningSummary) reasons.push(opportunity.decision.reasoningSummary);

  return uniqueReasons(reasons);
}

function manualReviewCandidate(opportunity: ProductOpportunity, ruleConfig: ActiveRuleConfig): boolean {
  const flags = opportunity.decision.riskFlags;
  const hardRejectFlags = ['BLOCKED_BRAND', 'BLOCKED_CATEGORY', 'BLOCKED_KEYWORD', 'AMAZON_COST_TOO_HIGH', 'AMAZON_OUT_OF_STOCK', 'MISSING_AMAZON_PRICE', 'MISSING_EBAY_PRICE', 'PRODUCT_IDENTITY_CONFLICT', 'BRAND_MISMATCH', 'MODEL_MISMATCH', 'BUNDLE_OR_QUANTITY_MISMATCH', 'VARIANT_MISMATCH'];
  if (flags.some((flag) => hardRejectFlags.includes(flag))) {
    return false;
  }

  const matchConfidence = opportunity.amazon.matchConfidence ?? 0;
  const minimumMatchFloor = Math.max(0.35, ruleConfig.thresholds.minimumMatchConfidence - 0.2);
  const minimumProfitFloor = Math.max(1, ruleConfig.thresholds.minimumProfitUsd * 0.8);
  const minimumRoiFloor = Math.max(5, ruleConfig.thresholds.minimumRoiPercent * 0.6);
  const nearMiss = matchConfidence >= minimumMatchFloor
    && opportunity.profit.expectedProfit >= minimumProfitFloor
    && opportunity.profit.roiPercent >= minimumRoiFloor;
  const identityUnproven = flags.some((flag) => ['LOW_MATCH_CONFIDENCE', 'BRAND_NOT_VERIFIED', 'MODEL_NOT_VERIFIED', 'PRODUCT_IDENTITY_UNVERIFIED', 'AMAZON_STOCK_UNKNOWN'].includes(flag));
  const highMarginNeedsReview = identityUnproven
    && matchConfidence >= 0.05
    && opportunity.profit.expectedProfit >= Math.max(50, ruleConfig.thresholds.minimumProfitUsd * 3)
    && opportunity.profit.roiPercent >= Math.max(60, ruleConfig.thresholds.minimumRoiPercent * 2);
  return nearMiss || highMarginNeedsReview;
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
  ruleConfig: ActiveRuleConfig,
  market?: DiscoveryMarket
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
      ...profitInputsFromRuleConfig(ruleConfig, market)
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
    soldMarketCandidates?: EbayCandidateInput[];
    activeMarketCandidates?: EbayCandidateInput[];
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
    .map((amazon) => scoreAmazonCandidateForEbay(ebay, amazon, ruleConfig, context.market))
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  const marketMetrics = calculateEbayMarketMetrics({
    soldCandidates: context.soldMarketCandidates?.length ? context.soldMarketCandidates : [ebay],
    activeCandidates: context.activeMarketCandidates,
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
  rejectedCount: number;
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
  const runIds = [...new Set(candidates.map((candidate: { runId: string }) => candidate.runId))];
  const marketCandidateRecords = runIds.length === 1
    ? await options.db.ebayDiscoveryCandidate.findMany({
      where: {
        runId: runIds[0],
        soldPrice: { not: null },
        safetyStatus: { not: 'REJECT' }
      },
      orderBy: { ebayScore: 'desc' },
      take: 100
    })
    : candidates;
  const soldMarketCandidates = marketCandidateRecords.map((candidate: Record<string, unknown>) => ebayFromRecord(candidate));

  const opportunities: ProductOpportunity[] = [];
  const manualReviews: ProductOpportunity[] = [];
  const rejected: ProductOpportunity[] = [];
  const reports: AmazonComparisonReport[] = [];
  let compared = 0;
  let rejectedCount = 0;

  for (const candidate of candidates) {
    const ebay = ebayFromRecord(candidate as Record<string, unknown>);
    const query = searchQueryForEbayProduct(ebay);
    const sourceCheck = filterEbaySourceCandidates([ebay], { sourceQuery: query, requireSoldPrice: true });
    if (sourceCheck.dropped.total > 0) {
      const report = skippedSourceReport(ebay, query, market, amazonMatchLimit, options.ruleConfig, sourceCheck.dropped);
      reports.push(report);
      await options.db.ebayDiscoveryCandidate.update({
        where: { id: candidate.id },
        data: {
          selected: true,
          comparisonStatus: 'REJECTED',
          scoreBreakdown: scoreBreakdownWithComparison(candidate.scoreBreakdown, report)
        }
      });
      rejectedCount += 1;
      continue;
    }

    await options.db.ebayDiscoveryCandidate.update({ where: { id: candidate.id }, data: { selected: true, comparisonStatus: 'COMPARING' } });
    try {
      const amazonSearch = await findAmazonMatchesForEbayProduct({
        ebay,
        apiKey: options.keepaApiKey,
        domain: market.amazonDomainId,
        limit: amazonMatchLimit
      });
      const amazonMatches = amazonSearch.matches;
      const reportQuery = amazonSearch.usedQueries.join(' | ');
      compared += 1;
      let activeMarketCandidates: EbayCandidateInput[] | undefined;
      let activeMarketWarning: string | undefined;
      if (options.serpApiKey) {
        try {
          const rawActiveMarketCandidates = await searchEbayCandidates({
            query,
            apiKey: options.serpApiKey,
            ebayDomain: market.ebayDomain,
            soldOnly: false,
            completedOnly: false,
            buyingFormat: 'BIN',
            conditionIds: conditionIdsBySetting.NEW,
            preferredLocation: 'Domestic',
            postalCode: market.defaultPostalCode,
            limit: 25
          });
          activeMarketCandidates = filterEbaySourceCandidates(rawActiveMarketCandidates, { sourceQuery: query, requireSoldPrice: false }).candidates;
        } catch (error) {
          if (!(error instanceof SerpApiError)) throw error;
          activeMarketWarning = 'Live eBay market check was skipped because SerpAPI is currently unavailable or out of quota.';
        }
      }
      const comparison = analyzeEbayAmazonComparison(ebay, amazonMatches, options.ruleConfig, reportQuery, {
        market,
        amazonMatchLimit,
        soldMarketCandidates,
        activeMarketCandidates
      });
      if (activeMarketWarning) comparison.report.reasons = uniqueReasons([...comparison.report.reasons, activeMarketWarning]);
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
        rejectedCount += 1;
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
        rejectedCount += 1;
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

  return { compared, rejectedCount, opportunities, manualReviews, rejected, reports };
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
      ...profitInputsFromRuleConfig(options.ruleConfig, report?.market?.key)
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
