import type { EbayCandidateInput } from '../domain/products.js';
import { ebayFixedNewListingRisks } from './discoveryPolicy.js';

export type EbaySourceDropReason = 'AUCTION_FORMAT' | 'MISSING_SOLD_PRICE' | 'NON_NEW_CONDITION';

export interface EbaySourceDropExample {
  reason: EbaySourceDropReason;
  title: string;
  soldPrice?: number;
  condition?: string;
  category?: string;
  sourceQuery?: string;
}

export interface EbaySourceDropStats {
  total: number;
  auctionFormat: number;
  missingSoldPrice: number;
  nonNewCondition: number;
  examples: EbaySourceDropExample[];
}

export interface FilteredEbaySourceCandidates {
  candidates: EbayCandidateInput[];
  dropped: EbaySourceDropStats;
}

export interface EbaySourceFilterOptions {
  requireSoldPrice?: boolean;
  sourceQuery?: string;
}

export function emptyEbaySourceDropStats(): EbaySourceDropStats {
  return {
    total: 0,
    auctionFormat: 0,
    missingSoldPrice: 0,
    nonNewCondition: 0,
    examples: []
  };
}

function sourceDropReason(ebay: EbayCandidateInput, requireSoldPrice: boolean): EbaySourceDropReason | undefined {
  const listingRisks = ebayFixedNewListingRisks(ebay).riskFlags;
  if (listingRisks.includes('EBAY_AUCTION_FORMAT')) return 'AUCTION_FORMAT';
  if (requireSoldPrice && !ebay.soldPrice) return 'MISSING_SOLD_PRICE';
  if (listingRisks.includes('EBAY_NOT_NEW')) return 'NON_NEW_CONDITION';
  return undefined;
}

function recordDrop(stats: EbaySourceDropStats, ebay: EbayCandidateInput, reason: EbaySourceDropReason, sourceQuery?: string): void {
  stats.total += 1;
  if (reason === 'AUCTION_FORMAT') stats.auctionFormat += 1;
  if (reason === 'MISSING_SOLD_PRICE') stats.missingSoldPrice += 1;
  if (reason === 'NON_NEW_CONDITION') stats.nonNewCondition += 1;
  if (stats.examples.length < 12) {
    stats.examples.push({
      reason,
      title: ebay.title,
      soldPrice: ebay.soldPrice,
      condition: ebay.condition,
      category: ebay.category,
      sourceQuery
    });
  }
}

export function mergeEbaySourceDropStats(target: EbaySourceDropStats, next: EbaySourceDropStats): EbaySourceDropStats {
  target.total += next.total;
  target.auctionFormat += next.auctionFormat;
  target.missingSoldPrice += next.missingSoldPrice;
  target.nonNewCondition += next.nonNewCondition;
  target.examples.push(...next.examples.slice(0, Math.max(0, 12 - target.examples.length)));
  return target;
}

export function filterEbaySourceCandidates(
  candidates: EbayCandidateInput[],
  options: EbaySourceFilterOptions | string = {}
): FilteredEbaySourceCandidates {
  const normalizedOptions = typeof options === 'string' ? { sourceQuery: options } : options;
  const requireSoldPrice = normalizedOptions.requireSoldPrice ?? true;
  const kept: EbayCandidateInput[] = [];
  const dropped = emptyEbaySourceDropStats();
  for (const candidate of candidates) {
    const reason = sourceDropReason(candidate, requireSoldPrice);
    if (reason) {
      recordDrop(dropped, candidate, reason, normalizedOptions.sourceQuery);
      continue;
    }
    kept.push(candidate);
  }
  return { candidates: kept, dropped };
}
