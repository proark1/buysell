import type { ProductOpportunity } from '../domain/products.js';

export interface ScoreThresholds {
  minimumProfitUsd: number;
  minimumRoiPercent: number;
  minimumOpportunityScore: number;
}

export interface OpportunityScore {
  total: number;
  profit: number;
  roi: number;
  demand: number;
  priceSignal: number;
  market: number;
  match: number;
  riskPenalty: number;
  reasons: string[];
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value);

function demandScore(salesRank?: number, reviewCount?: number, rating?: number): number {
  let score = 0;
  if (salesRank) {
    if (salesRank <= 10_000) score += 15;
    else if (salesRank <= 50_000) score += 12;
    else if (salesRank <= 150_000) score += 8;
    else if (salesRank <= 500_000) score += 4;
    else score += 1;
  }
  if (reviewCount) score += clamp(reviewCount / 100, 0, 4);
  if (rating && rating >= 4.2) score += 2;
  return clamp(score, 0, 18);
}

function priceSignalScore(priceDropPercent?: number, hasPrice?: boolean): number {
  let score = hasPrice ? 4 : 0;
  if (priceDropPercent !== undefined) {
    if (priceDropPercent >= 25) score += 13;
    else if (priceDropPercent >= 15) score += 10;
    else if (priceDropPercent >= 8) score += 6;
    else if (priceDropPercent >= 3) score += 3;
  }
  return clamp(score, 0, 17);
}

function riskPenalty(riskFlags: string[]): number {
  return riskFlags.reduce((penalty, flag) => {
    if (['BLOCKED_BRAND', 'BLOCKED_CATEGORY', 'BLOCKED_KEYWORD'].includes(flag)) return penalty + 100;
    if (['PRODUCT_IDENTITY_CONFLICT', 'BRAND_MISMATCH', 'MODEL_MISMATCH', 'BUNDLE_OR_QUANTITY_MISMATCH', 'VARIANT_MISMATCH'].includes(flag)) return penalty + 100;
    if (flag === 'PRODUCT_IDENTITY_UNVERIFIED' || flag === 'BRAND_NOT_VERIFIED' || flag === 'MODEL_NOT_VERIFIED') return penalty + 24;
    if (flag === 'AMAZON_COST_TOO_HIGH') return penalty + 40;
    if (flag === 'AMAZON_OUT_OF_STOCK') return penalty + 36;
    if (flag === 'AMAZON_COST_ABOVE_PROFILE') return penalty + 14;
    if (flag.startsWith('MISSING_')) return penalty + 30;
    if (flag === 'LOW_MATCH_CONFIDENCE') return penalty + 18;
    if (flag === 'LOW_PROFIT' || flag === 'LOW_ROI') return penalty + 16;
    if (flag === 'AMAZON_STOCK_UNKNOWN') return penalty + 8;
    if (flag === 'LOW_SELL_THROUGH') return penalty + 14;
    if (flag === 'HIGH_COMPETITION') return penalty + 12;
    if (flag === 'HIGH_SOLD_PRICE_SPREAD') return penalty + 8;
    if (flag === 'TARGET_PRICE_ABOVE_MARKET') return penalty + 8;
    if (flag === 'NO_SOLD_MARKET_SAMPLE') return penalty + 10;
    return penalty + 4;
  }, 0);
}

export function scoreOpportunity(opportunity: ProductOpportunity, thresholds: ScoreThresholds, riskFlags: string[]): OpportunityScore {
  const profit = clamp((opportunity.profit.expectedProfit / thresholds.minimumProfitUsd) * 22, 0, 24);
  const roi = clamp((opportunity.profit.roiPercent / thresholds.minimumRoiPercent) * 16, 0, 18);
  const demand = demandScore(opportunity.amazon.salesRank, opportunity.amazon.reviewCount, opportunity.amazon.rating);
  const priceSignal = priceSignalScore(opportunity.amazon.priceDropPercent, Boolean(opportunity.amazon.buyBoxPrice ?? opportunity.amazon.currentPrice));
  const market = opportunity.marketMetrics ? clamp((opportunity.marketMetrics.demandScore / 100) * 12, 0, 12) : 0;
  const match = clamp((opportunity.amazon.matchConfidence ?? 0) * 23, 0, 23);
  const combinedRiskFlags = [...new Set([...riskFlags, ...(opportunity.marketMetrics?.riskFlags ?? [])])];
  const risk = riskPenalty(combinedRiskFlags);
  const total = round(clamp(profit + roi + demand + priceSignal + market + match - risk, 0, 100));

  const reasons: string[] = [];
  if (opportunity.profit.expectedProfit >= thresholds.minimumProfitUsd) reasons.push(`Profit ${opportunity.profit.expectedProfit.toFixed(2)} clears minimum.`);
  if (opportunity.profit.roiPercent >= thresholds.minimumRoiPercent) reasons.push(`ROI ${opportunity.profit.roiPercent.toFixed(1)}% clears target.`);
  if ((opportunity.amazon.matchConfidence ?? 0) >= 0.75) reasons.push('Strong Amazon/eBay match.');
  if (opportunity.marketMetrics?.soldSampleSize) reasons.push(`${opportunity.marketMetrics.soldSampleSize} sold comps support market confidence.`);
  if (opportunity.marketMetrics?.sellThroughRate !== undefined) reasons.push(`Estimated sell-through ${(opportunity.marketMetrics.sellThroughRate * 100).toFixed(1)}%.`);
  if (opportunity.amazon.priceDropPercent && opportunity.amazon.priceDropPercent >= 8) reasons.push(`Amazon price is down ${opportunity.amazon.priceDropPercent.toFixed(1)}% versus recent history.`);
  if (opportunity.amazon.salesRank) reasons.push(`Keepa sales rank signal: ${opportunity.amazon.salesRank}.`);
  if (risk > 0) reasons.push(`Risk penalty applied for ${combinedRiskFlags.join(', ')}.`);

  return {
    total,
    profit: round(profit),
    roi: round(roi),
    demand: round(demand),
    priceSignal: round(priceSignal),
    market: round(market),
    match: round(match),
    riskPenalty: risk,
    reasons
  };
}
