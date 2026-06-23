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
  replenishmentFit: number;
  riskPenalty: number;
  reasons: string[];
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number): number => Math.round(value);

const normalizeSignalText = (value: string): string => value
  .toLowerCase()
  .replace(/ä/g, 'ae')
  .replace(/ö/g, 'oe')
  .replace(/ü/g, 'ue')
  .replace(/ß/g, 'ss')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function replenishmentFit(product: AmazonMatchInput): { score: number; reasons: string[] } {
  const text = normalizeSignalText([
    product.title,
    product.brand,
    product.rootCategory,
    ...(product.categoryTree ?? [])
  ].filter(Boolean).join(' '));
  let score = 0;
  const reasons: string[] = [];

  if (/\b\d+\s*(?:er|x|pack|packs|stueck|stk|tabletten|kapseln|count|ct|waschladungen)\b/.test(text)) {
    score += 4;
    reasons.push('Multipack/count signal matches proven replenishment winners.');
  }
  if (/\b(?:kapseln|tabletten|omega|zink|magnesium|bisglycinat|supplement|vitamin|rizinusoel|fish oil|fischoel|algenoel)\b/.test(text)) {
    score += 7;
    reasons.push('Wellness replenishment pattern matches proven winners.');
  }
  if (/\b(?:nachfueller|refill|air freshener|lufterfrischer|detergent|waschmittel|staubxpress|febreze|lenor|pronto|cleaner|reiniger)\b/.test(text)) {
    score += 7;
    reasons.push('Household cleaning/refill pattern matches proven winners.');
  }
  if (/\b(?:ant bait|ameisen|ameisenkoeder|ameisenfalle|koederdose|klebefalle)\b/.test(text)) {
    score += 7;
    reasons.push('Pest-control replenishment pattern matches proven winners.');
  }
  if (/\b(?:cat litter|pet food|katzenstreu|trockenfutter|katzenfutter|hundefutter|beaphar|floratorf|biscoff)\b/.test(text)) {
    score += 5;
    reasons.push('Pet, garden, or pantry replenishment pattern matches proven winners.');
  }

  return { score: clamp(score, 0, 10), reasons };
}

// Sales-rank scales vary enormously by category (a 50k rank is excellent in a small
// category but mediocre in Books/Electronics). Divide the raw rank by a per-category factor
// so the rank buckets below are roughly comparable across categories.
const categoryRankDivisor = (rootCategory: string | undefined): number => {
  const key = (rootCategory ?? '').toLowerCase();
  if (/book|kindle|magazine/.test(key)) return 12;
  if (/electronic|cell phone|computer|camera/.test(key)) return 6;
  if (/clothing|shoe|apparel|home|kitchen|toy|sports|beauty|grocery/.test(key)) return 3;
  return 1;
};

function demandScore(product: AmazonMatchInput): number {
  let score = 0;
  const salesRank = product.salesRank;
  if (salesRank) {
    const normalizedRank = salesRank / categoryRankDivisor(product.rootCategory);
    if (normalizedRank <= 10_000) score += 22;
    else if (normalizedRank <= 50_000) score += 18;
    else if (normalizedRank <= 150_000) score += 13;
    else if (normalizedRank <= 500_000) score += 7;
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
  const replenishment = replenishmentFit(product);
  const risk = riskPenalty(riskFlags);
  const total = round(clamp(priceSignal + demand + quality + availability + costFit + replenishment.score - risk, 0, 100));

  const reasons: string[] = [];
  if (amazonCost) reasons.push(`Amazon price ${amazonCost.toFixed(2)} is within scan budget.`);
  if (priceDrop >= options.minPriceDropPercent && priceDrop > 0) reasons.push(`Price is down ${priceDrop.toFixed(1)}% versus recent history.`);
  if (product.salesRank) reasons.push(`Keepa sales rank signal: ${product.salesRank}.`);
  if (product.reviewCount) reasons.push(`${product.reviewCount} reviews support demand confidence.`);
  if (product.availabilityStatus === 'IN_STOCK') reasons.push('Amazon shows in stock.');
  if (replenishment.score > 0) reasons.push(...replenishment.reasons);
  if (risk > 0) reasons.push(`Risk penalty applied for ${riskFlags.join(', ')}.`);

  return {
    total,
    priceSignal: round(priceSignal),
    demand: round(demand),
    quality: round(quality),
    availability: round(availability),
    costFit: round(costFit),
    replenishmentFit: round(replenishment.score),
    riskPenalty: risk,
    reasons
  };
}
