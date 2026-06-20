import type { EbayCandidateInput, OpportunityMarketMetrics } from '../domain/products.js';

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const roundPercent = (value: number): number => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const quantile = (values: number[], q: number): number | undefined => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const percentileRank = (values: number[], target: number | undefined): number | undefined => {
  if (!values.length || target === undefined) return undefined;
  const belowOrEqual = values.filter((value) => value <= target).length;
  return roundPercent(belowOrEqual / values.length);
};

export function calculateEbayMarketMetrics(input: {
  soldCandidates: EbayCandidateInput[];
  activeCandidates?: EbayCandidateInput[];
  targetPrice?: number;
  minimumSellThroughRate?: number;
  maximumCompetitionRatio?: number;
  // Per-family sold aggregates captured during discovery from ALL of a family's sold comps,
  // not just the single persisted candidate. When richer than the persisted sample, it drives
  // the demand/competition/spread metrics so they reflect the real comp count.
  familySoldAggregate?: { soldCount?: number; minSoldPrice?: number; medianSoldPrice?: number; maxSoldPrice?: number };
}): OpportunityMarketMetrics {
  const soldPrices = input.soldCandidates
    .map((candidate) => candidate.soldPrice)
    .filter((price): price is number => price !== undefined && Number.isFinite(price) && price > 0);
  const activeCount = input.activeCandidates?.length;
  const soldCount = soldPrices.length;
  const medianSoldPrice = quantile(soldPrices, 0.5);
  const averageSoldPrice = soldPrices.length
    ? soldPrices.reduce((sum, price) => sum + price, 0) / soldPrices.length
    : undefined;
  const lowSoldPrice = soldPrices.length ? Math.min(...soldPrices) : undefined;
  const highSoldPrice = soldPrices.length ? Math.max(...soldPrices) : undefined;

  // Use the family aggregate when it represents more sold comps than the persisted sample.
  const familySoldCount = input.familySoldAggregate?.soldCount ?? 0;
  const effectiveSoldCount = Math.max(soldCount, familySoldCount);
  const useFamilySpread = familySoldCount > soldCount
    && input.familySoldAggregate?.minSoldPrice !== undefined
    && input.familySoldAggregate?.maxSoldPrice !== undefined
    && (input.familySoldAggregate?.medianSoldPrice ?? 0) > 0;
  const effectiveLow = useFamilySpread ? input.familySoldAggregate?.minSoldPrice : lowSoldPrice;
  const effectiveHigh = useFamilySpread ? input.familySoldAggregate?.maxSoldPrice : highSoldPrice;
  const effectiveMedian = useFamilySpread ? input.familySoldAggregate?.medianSoldPrice : medianSoldPrice;

  const priceSpreadPercent = effectiveMedian && effectiveLow !== undefined && effectiveHigh !== undefined
    ? ((effectiveHigh - effectiveLow) / effectiveMedian) * 100
    : undefined;
  // With no sold sample, dividing by a floor of 1 fabricates a sell-through of 0 and a
  // competition ratio equal to the active count (e.g. a fake HIGH_COMPETITION). Leave both
  // undefined and let NO_SOLD_MARKET_SAMPLE carry the signal instead.
  const sellThroughRate = activeCount !== undefined && effectiveSoldCount > 0
    ? effectiveSoldCount / (effectiveSoldCount + activeCount)
    : undefined;
  const competitionRatio = activeCount !== undefined && effectiveSoldCount > 0
    ? activeCount / effectiveSoldCount
    : undefined;
  const targetPricePercentile = percentileRank(soldPrices, input.targetPrice);
  const riskFlags: string[] = [];
  const reasons: string[] = [];

  if (effectiveSoldCount === 0) {
    riskFlags.push('NO_SOLD_MARKET_SAMPLE');
    reasons.push('No priced sold eBay results were available for market-quality scoring.');
  } else {
    reasons.push(`${effectiveSoldCount} priced sold eBay results support demand analysis.`);
  }

  if (priceSpreadPercent !== undefined && priceSpreadPercent > 80) {
    riskFlags.push('HIGH_SOLD_PRICE_SPREAD');
    reasons.push(`Sold-price spread is high at ${priceSpreadPercent.toFixed(1)}%, so comps may include mismatched variants or conditions.`);
  }

  if (sellThroughRate !== undefined) {
    const minimum = input.minimumSellThroughRate ?? 0.05;
    if (sellThroughRate < minimum) {
      riskFlags.push('LOW_SELL_THROUGH');
      reasons.push(`Estimated sell-through ${(sellThroughRate * 100).toFixed(1)}% is below the ${(minimum * 100).toFixed(1)}% minimum.`);
    } else {
      reasons.push(`Estimated sell-through ${(sellThroughRate * 100).toFixed(1)}% clears the target.`);
    }
  }

  if (competitionRatio !== undefined) {
    const maximum = input.maximumCompetitionRatio ?? 12;
    if (competitionRatio > maximum) {
      riskFlags.push('HIGH_COMPETITION');
      reasons.push(`Active-to-sold competition ratio ${competitionRatio.toFixed(1)} is above the ${maximum.toFixed(1)} cap.`);
    }
  }

  if (targetPricePercentile !== undefined && targetPricePercentile > 0.85) {
    riskFlags.push('TARGET_PRICE_ABOVE_MARKET');
    reasons.push('Recommended price is in the top 15% of observed sold comps.');
  }

  const sampleScore = clamp((effectiveSoldCount / 8) * 35, 0, 35);
  const spreadScore = priceSpreadPercent === undefined ? 8 : clamp(25 - (priceSpreadPercent / 4), 0, 25);
  const sellThroughScore = sellThroughRate === undefined ? 12 : clamp(sellThroughRate * 100, 0, 25);
  const competitionScore = competitionRatio === undefined ? 8 : clamp(15 - competitionRatio, 0, 15);
  const demandScore = Math.round(clamp(sampleScore + spreadScore + sellThroughScore + competitionScore, 0, 100));

  return {
    soldSampleSize: effectiveSoldCount,
    activeSampleSize: activeCount,
    medianSoldPrice: effectiveMedian === undefined ? undefined : roundMoney(effectiveMedian),
    averageSoldPrice: averageSoldPrice === undefined ? undefined : roundMoney(averageSoldPrice),
    lowSoldPrice: effectiveLow === undefined ? undefined : roundMoney(effectiveLow),
    highSoldPrice: effectiveHigh === undefined ? undefined : roundMoney(effectiveHigh),
    priceSpreadPercent: priceSpreadPercent === undefined ? undefined : roundPercent(priceSpreadPercent),
    targetPricePercentile,
    sellThroughRate: sellThroughRate === undefined ? undefined : roundPercent(sellThroughRate),
    competitionRatio: competitionRatio === undefined ? undefined : roundPercent(competitionRatio),
    demandScore,
    riskFlags,
    reasons
  };
}
