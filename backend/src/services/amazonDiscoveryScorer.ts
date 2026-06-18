import type { AmazonMatchInput } from '../domain/products.js';

export interface AmazonDiscoveryScoreOptions {
  minPriceDropPercent: number;
  maxAmazonCostUsd: number;
  minimumAmazonScore: number;
}

export interface AmazonDiscoveryScore {
  total: number;
  priceSignal: number;
  demand: number;
  quality: number;
  availability: number;
  costFit: number;
  riskPenalty: number;
  reasons: string[];
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value);

function demandScore(product: AmazonMatchInput): number {
  let score = 0;
  const salesRank = product.salesRank;
  if (salesRank) {
    if (salesRank <= 10_000) score += 22;
    else if (salesRank <= 50_000) score += 18;
    else if (salesRank <= 150_000) score += 13;
    else if (salesRank <= 500_000) score += 7;
    else score += 2;
  }
  if (product.reviewCount) score += clamp(product.reviewCount / 80, 0, 5);
  return clamp(score, 0, 25);
}

function riskPenalty(riskFlags: string[]): number {
  return riskFlags.reduce((total, flag) => {
    if (['BLOCKED_BRAND', 'BLOCKED_CATEGORY', 'BLOCKED_KEYWORD'].includes(flag)) return total + 100;
    if (flag === 'AMAZON_COST_TOO_HIGH') return total + 40;
    if (flag === 'AMAZON_OUT_OF_STOCK') return total + 35;
    if (flag === 'MISSING_AMAZON_PRICE') return total + 35;
    if (flag === 'AMAZON_COST_ABOVE_PROFILE') return total + 14;
    if (flag === 'AMAZON_STOCK_UNKNOWN') return total + 10;
    if (flag === 'OUTSIDE_ALLOWED_CATEGORY' || flag === 'CATEGORY_UNKNOWN') return total;
    return total + 4;
  }, 0);
}

export function scoreAmazonDiscoveryCandidate(
  product: AmazonMatchInput,
  options: AmazonDiscoveryScoreOptions,
  riskFlags: string[]
): AmazonDiscoveryScore {
  const amazonCost = product.buyBoxPrice ?? product.currentPrice;
  const priceDrop = product.priceDropPercent ?? 0;
  const priceSignal = clamp((priceDrop / Math.max(options.minPriceDropPercent, 1)) * 20, amazonCost ? 4 : 0, 25);
  const demand = demandScore(product);
  const quality = clamp((product.rating ?? 0) >= 4.2 ? 12 : (product.rating ?? 0) >= 3.8 ? 7 : product.rating ? 3 : 0, 0, 12);
  const availability = product.availabilityStatus === 'IN_STOCK' ? 12 : product.availabilityStatus ? 4 : 6;
  const costFit = amazonCost ? clamp((1 - Math.abs((amazonCost / options.maxAmazonCostUsd) - 0.45)) * 18, 0, 18) : 0;
  const risk = riskPenalty(riskFlags);
  const total = round(clamp(priceSignal + demand + quality + availability + costFit - risk, 0, 100));

  const reasons: string[] = [];
  if (amazonCost) reasons.push(`Amazon price ${amazonCost.toFixed(2)} is within scan budget.`);
  if (priceDrop >= options.minPriceDropPercent && priceDrop > 0) reasons.push(`Price is down ${priceDrop.toFixed(1)}% versus recent history.`);
  if (product.salesRank) reasons.push(`Keepa sales rank signal: ${product.salesRank}.`);
  if (product.reviewCount) reasons.push(`${product.reviewCount} reviews support demand confidence.`);
  if (product.availabilityStatus === 'IN_STOCK') reasons.push('Amazon shows in stock.');
  if (risk > 0) reasons.push(`Risk penalty applied for ${riskFlags.join(', ')}.`);

  return {
    total,
    priceSignal: round(priceSignal),
    demand: round(demand),
    quality: round(quality),
    availability: round(availability),
    costFit: round(costFit),
    riskPenalty: risk,
    reasons
  };
}
