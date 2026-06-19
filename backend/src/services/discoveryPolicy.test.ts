import { evaluateProductSafety } from './discoveryPolicy.js';
import { assertEqual, assertIncludes } from './testHelpers.js';

const basePolicy = {
  safeMode: true,
  blockedBrands: [],
  blockedCategories: ['Food', 'Clothing'],
  blockedKeywords: ['supplement', 'shirt'],
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

const aboveProfileButReviewable = evaluateProductSafety(
  { title: 'Thermal label printer', soldPrice: 300, category: 'Office Products' },
  { asin: 'B000PRINT2', title: 'Thermal label printer', currentPrice: 175, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  { ...basePolicy, maxAmazonCostUsd: 150 }
);

assertEqual(aboveProfileButReviewable.status, 'WARN', 'above profile cost remains reviewable when backed by eBay sold price');
assertIncludes(aboveProfileButReviewable.riskFlags, 'AMAZON_COST_ABOVE_PROFILE', 'above profile review flag');

const unknownCategory = evaluateProductSafety(
  { title: 'Thermal label printer', soldPrice: 129.99 },
  { asin: 'B000CAT', title: 'Thermal label printer', currentPrice: 40, availabilityStatus: 'IN_STOCK', matchConfidence: 0.91 },
  basePolicy
);

assertEqual(unknownCategory.status, 'PASS', 'missing category should not reject or warn when product identity can prove the match');
if (unknownCategory.riskFlags.includes('CATEGORY_UNKNOWN')) throw new Error('missing category should not create a risk flag');

const stockUnknown = evaluateProductSafety(
  { title: 'Thermal label printer', soldPrice: 129.99, category: 'Office Products' },
  { asin: 'B000STOCK', title: 'Thermal label printer', currentPrice: 40, availabilityStatus: 'UNKNOWN', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  basePolicy
);

assertEqual(stockUnknown.status, 'WARN', 'unknown stock should route to review');
assertIncludes(stockUnknown.riskFlags, 'AMAZON_STOCK_UNKNOWN', 'unknown stock flag');

const outOfStock = evaluateProductSafety(
  { title: 'Thermal label printer', soldPrice: 129.99, category: 'Office Products' },
  { asin: 'B000OUT', title: 'Thermal label printer', currentPrice: 40, availabilityStatus: 'OUT_OF_STOCK', matchConfidence: 0.91, categoryTree: ['Office Products'] },
  basePolicy
);

assertEqual(outOfStock.status, 'REJECT', 'out of stock should hard reject');
assertIncludes(outOfStock.riskFlags, 'AMAZON_OUT_OF_STOCK', 'out of stock flag');

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
