import { evaluateProductSafety } from './discoveryPolicy.js';
import { assertEqual, assertIncludes } from './testHelpers.js';

const basePolicy = {
  safeMode: true,
  blockedBrands: [],
  blockedCategories: ['Food', 'Clothing'],
  blockedKeywords: ['supplement', 'shirt'],
  allowedCategories: ['Electronics', 'Office Products'],
  maxAmazonCostUsd: 100
};

const blocked = evaluateProductSafety(
  { title: 'Organic supplement bundle', soldPrice: 49.99, category: 'Food' },
  { asin: 'B000FOOD', title: 'Organic supplement', currentPrice: 20, availabilityStatus: 'IN_STOCK', matchConfidence: 0.9 },
  basePolicy
);

assertEqual(blocked.status, 'REJECT', 'blocked consumable product status');
assertIncludes(blocked.riskFlags, 'BLOCKED_CATEGORY', 'blocked consumable product flags');
assertIncludes(blocked.riskFlags, 'BLOCKED_KEYWORD', 'blocked consumable keyword flags');

const safe = evaluateProductSafety(
  { title: 'Wireless barcode scanner', soldPrice: 79.99, category: 'Office Products' },
  { asin: 'B000SCAN', title: 'Wireless barcode scanner', currentPrice: 35, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  basePolicy
);

assertEqual(safe.status, 'PASS', 'safe product status');

const expensive = evaluateProductSafety(
  { title: 'Thermal label printer', soldPrice: 199.99, category: 'Office Products' },
  { asin: 'B000PRINT', title: 'Thermal label printer', currentPrice: 140, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  basePolicy
);

assertEqual(expensive.status, 'REJECT', 'expensive product status');
assertIncludes(expensive.riskFlags, 'AMAZON_COST_TOO_HIGH', 'expensive product flags');

console.log('discoveryPolicy unit test passed');
