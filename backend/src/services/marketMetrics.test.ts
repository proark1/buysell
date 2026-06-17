import { calculateEbayMarketMetrics } from './marketMetrics.js';
import { assertApprox, assertEqual } from './testHelpers.js';

const metrics = calculateEbayMarketMetrics({
  soldCandidates: [
    { title: 'A', soldPrice: 80 },
    { title: 'B', soldPrice: 100 },
    { title: 'C', soldPrice: 120 },
    { title: 'D', soldPrice: 300 }
  ],
  activeCandidates: [
    { title: 'Active 1' },
    { title: 'Active 2' }
  ],
  targetPrice: 120,
  minimumSellThroughRate: 0.25,
  maximumCompetitionRatio: 3
});

assertEqual(metrics.soldSampleSize, 4, 'sold sample size');
assertEqual(metrics.activeSampleSize, 2, 'active sample size');
assertApprox(metrics.medianSoldPrice ?? 0, 110, 'median sold price');
assertApprox(metrics.sellThroughRate ?? 0, 0.667, 'sell-through rate');
assertApprox(metrics.competitionRatio ?? 0, 0.5, 'competition ratio');
if (!metrics.riskFlags.includes('HIGH_SOLD_PRICE_SPREAD')) {
  throw new Error('expected high spread risk flag');
}
if (metrics.demandScore <= 0) throw new Error('expected positive demand score');

console.log('marketMetrics unit test passed');
