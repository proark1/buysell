import { applyDiscoverySafetyOverrides, evaluateAmazonProductSafety, getAmazonDiscoveryCategory, getAmazonDiscoveryProfile } from './discoveryPolicy.js';
import { selectAmazonDiscoveryQueries } from './amazonDiscovery.js';
import { scoreAmazonDiscoveryCandidate } from './amazonDiscoveryScorer.js';
import { assertEqual, assertIncludes } from './testHelpers.js';

const policy = {
  safeMode: true,
  blockedBrands: [],
  blockedCategories: ['Food', 'Clothing'],
  blockedKeywords: ['supplement', 'shirt'],
  maxAmazonCostUsd: 150
};

const safeAmazon = {
  asin: 'B000SCAN',
  title: 'Wireless barcode scanner',
  buyBoxPrice: 42,
  avg90Price: 62,
  priceDropPercent: 32.3,
  availabilityStatus: 'IN_STOCK',
  salesRank: 24_000,
  rating: 4.5,
  reviewCount: 420,
  rootCategory: 'Office Products',
  categoryTree: ['Office Products'],
  matchConfidence: 0
};

const safeReview = evaluateAmazonProductSafety(safeAmazon, policy);
assertEqual(safeReview.status, 'PASS', 'safe Amazon candidate status');

const strongScore = scoreAmazonDiscoveryCandidate(safeAmazon, {
  minPriceDropPercent: 5,
  maxAmazonCostUsd: 150,
  minimumAmazonScore: 62
}, safeReview.riskFlags);

if (strongScore.total < 70) {
  throw new Error(`strong Amazon candidate score: expected >= 70, got ${strongScore.total}`);
}

const blockedAmazon = {
  asin: 'B000FOOD',
  title: 'Organic supplement capsules',
  buyBoxPrice: 22,
  avg90Price: 26,
  priceDropPercent: 15.3,
  availabilityStatus: 'IN_STOCK',
  rootCategory: 'Food',
  categoryTree: ['Food'],
  matchConfidence: 0
};

const blockedReview = evaluateAmazonProductSafety(blockedAmazon, policy);
assertEqual(blockedReview.status, 'REJECT', 'blocked Amazon candidate status');
assertIncludes(blockedReview.riskFlags, 'BLOCKED_CATEGORY', 'blocked Amazon category flag');
assertIncludes(blockedReview.riskFlags, 'BLOCKED_KEYWORD', 'blocked Amazon keyword flag');

const blockedScore = scoreAmazonDiscoveryCandidate(blockedAmazon, {
  minPriceDropPercent: 5,
  maxAmazonCostUsd: 150,
  minimumAmazonScore: 62
}, blockedReview.riskFlags);

assertEqual(blockedScore.total, 0, 'blocked Amazon candidate score');

const replenishmentProfile = getAmazonDiscoveryProfile('proven-replenishment');
const replenishmentReview = evaluateAmazonProductSafety(
  blockedAmazon,
  applyDiscoverySafetyOverrides(policy, replenishmentProfile)
);
assertEqual(replenishmentReview.status, 'PASS', 'proven replenishment Amazon profile allows winner-pattern categories');

const replenishmentScore = scoreAmazonDiscoveryCandidate(blockedAmazon, {
  minPriceDropPercent: replenishmentProfile.minPriceDropPercent,
  maxAmazonCostUsd: replenishmentProfile.maxAmazonCostUsd,
  minimumAmazonScore: replenishmentProfile.minimumAmazonScore
}, replenishmentReview.riskFlags);
assertEqual(replenishmentScore.replenishmentFit > 0, true, 'replenishment Amazon score captures winner-pattern fit');

const scoutProfile = getAmazonDiscoveryProfile('starter-safe');
const scoutCategory = getAmazonDiscoveryCategory(scoutProfile, 'office-electronics');
const customQueries = selectAmazonDiscoveryQueries(scoutProfile, scoutCategory, 'thermal label printer', 10);
assertEqual(customQueries.length, 1, 'custom Amazon Scout query count');
assertEqual(customQueries[0], 'thermal label printer', 'custom Amazon Scout query');

const seedQueries = selectAmazonDiscoveryQueries(scoutProfile, scoutCategory, undefined, 20);
assertEqual(seedQueries.length, 2, 'category seed query count scales with limit');

console.log('amazonDiscoveryScorer unit test passed');
