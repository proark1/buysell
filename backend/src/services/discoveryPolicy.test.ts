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

const addressLabel = evaluateProductSafety(
  { title: 'Thermal address label printer', soldPrice: 79.99, category: 'Office Products' },
  { asin: 'B000ADDR', title: 'Thermal address label printer', currentPrice: 35, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  { ...basePolicy, blockedKeywords: ['dress'] }
);

assertEqual(addressLabel.status, 'PASS', 'address should not match blocked dress keyword');

const dress = evaluateProductSafety(
  { title: 'Summer dress', soldPrice: 79.99, category: 'Office Products' },
  { asin: 'B000DRESS', title: 'Summer dress', currentPrice: 35, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  { ...basePolicy, blockedKeywords: ['dress'] }
);

assertEqual(dress.status, 'REJECT', 'standalone dress keyword remains blocked');
assertIncludes(dress.riskFlags, 'BLOCKED_KEYWORD', 'standalone dress keyword flag');

const expensive = evaluateProductSafety(
  { title: 'Thermal label printer', soldPrice: 199.99, category: 'Office Products' },
  { asin: 'B000PRINT', title: 'Thermal label printer', currentPrice: 140, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  basePolicy
);

assertEqual(expensive.status, 'REJECT', 'expensive product status');
assertIncludes(expensive.riskFlags, 'AMAZON_COST_TOO_HIGH', 'expensive product flags');

const usedEbay = evaluateProductSafety(
  { title: 'Wireless barcode scanner', soldPrice: 79.99, condition: 'Used', category: 'Office Products' },
  { asin: 'B000USED', title: 'Wireless barcode scanner', currentPrice: 35, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  basePolicy
);

assertEqual(usedEbay.status, 'REJECT', 'used eBay listing status');
assertIncludes(usedEbay.riskFlags, 'EBAY_NOT_NEW', 'used eBay listing flag');

const auctionEbay = evaluateProductSafety(
  { title: 'Wireless barcode scanner', soldPrice: 79.99, condition: 'New', category: 'Office Products', raw: { bids: '3 bids' } },
  { asin: 'B000BID', title: 'Wireless barcode scanner', currentPrice: 35, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  basePolicy
);

assertEqual(auctionEbay.status, 'REJECT', 'auction eBay listing status');
assertIncludes(auctionEbay.riskFlags, 'EBAY_AUCTION_FORMAT', 'auction eBay listing flag');

console.log('discoveryPolicy unit test passed');
