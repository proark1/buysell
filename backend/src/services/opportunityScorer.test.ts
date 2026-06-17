import { scoreOpportunity } from './opportunityScorer.js';
import { assertEqual } from './testHelpers.js';

const strongScore = scoreOpportunity({
  ebay: { title: 'Wireless barcode scanner', soldPrice: 89.99, category: 'Office Products' },
  amazon: {
    asin: 'B000SCAN',
    title: 'Wireless barcode scanner',
    buyBoxPrice: 39.99,
    avg90Price: 54.99,
    priceDropPercent: 27.3,
    availabilityStatus: 'IN_STOCK',
    salesRank: 22_000,
    rating: 4.6,
    reviewCount: 480,
    matchConfidence: 0.91
  },
  profit: { estimatedFees: 13, estimatedTax: 3.2, bufferAmount: 4, expectedProfit: 29.8, roiPercent: 65, marginPercent: 33 },
  decision: { decision: 'LIST', confidence: 0.9, riskFlags: [], reasoningSummary: 'ok' }
}, { minimumProfitUsd: 10, minimumRoiPercent: 25, minimumOpportunityScore: 65 }, []);

if (strongScore.total < 75) {
  throw new Error(`strong opportunity score: expected >= 75, got ${strongScore.total}`);
}

const riskyScore = scoreOpportunity({
  ebay: { title: 'Organic supplement', soldPrice: 49.99, category: 'Food' },
  amazon: { asin: 'B000FOOD', title: 'Organic supplement', currentPrice: 19.99, matchConfidence: 0.9 },
  profit: { estimatedFees: 8, estimatedTax: 1.6, bufferAmount: 4, expectedProfit: 16.4, roiPercent: 40, marginPercent: 32 },
  decision: { decision: 'REJECT', confidence: 0.95, riskFlags: ['BLOCKED_CATEGORY'], reasoningSummary: 'blocked' }
}, { minimumProfitUsd: 10, minimumRoiPercent: 25, minimumOpportunityScore: 65 }, ['BLOCKED_CATEGORY']);

assertEqual(riskyScore.total, 0, 'blocked opportunity score');

console.log('opportunityScorer unit test passed');
