import { analyzeAmazonEbayComparison } from './amazonDiscovery.js';
import { defaultRuleConfig } from '../repositories/ruleConfigRepository.js';
import { assertEqual } from './testHelpers.js';
import type { AmazonMatchInput, EbayCandidateInput } from '../domain/products.js';

const amazon: AmazonMatchInput = {
  asin: 'B000SCAN',
  title: 'Tera X100 Wireless Barcode Scanner',
  brand: 'Tera',
  model: 'X100',
  buyBoxPrice: 50,
  currentPrice: 50,
  avg90Price: 70,
  priceDropPercent: 28,
  availabilityStatus: 'IN_STOCK',
  salesRank: 12_000,
  rating: 4.5,
  reviewCount: 700,
  rootCategory: 'Office Products',
  categoryTree: ['Office Products'],
  matchConfidence: 0
};

const noResults = analyzeAmazonEbayComparison(amazon, [], defaultRuleConfig, 'Tera Wireless Barcode Scanner');
assertEqual(noResults.report.status, 'NO_EBAY_RESULTS', 'comparison no eBay results status');
assertEqual(noResults.report.reasons[0], 'No completed/sold eBay listings were found for this Amazon product search.', 'comparison no eBay results reason');

const noFixedPriceResults = analyzeAmazonEbayComparison(amazon, [], defaultRuleConfig, 'Tera Wireless Barcode Scanner', {
  sourceDrops: {
    total: 1,
    auctionFormat: 1,
    missingSoldPrice: 0,
    nonNewCondition: 0,
    examples: [{
      reason: 'AUCTION_FORMAT',
      title: 'Tera Wireless Barcode Scanner Auction',
      soldPrice: 120,
      condition: 'New'
    }]
  }
});
assertEqual(noFixedPriceResults.report.status, 'NO_FIXED_PRICE_EBAY_RESULTS', 'comparison only dropped eBay source rows status');

const cheapEbay: EbayCandidateInput[] = [{
  title: 'Tera Wireless Barcode Scanner',
  soldPrice: 35,
  condition: 'Used'
}];

const cheapResult = analyzeAmazonEbayComparison(amazon, cheapEbay, defaultRuleConfig, 'Tera Wireless Barcode Scanner');
assertEqual(cheapResult.report.status, 'REJECTED', 'comparison low eBay price status');
if (!cheapResult.report.reasons.some((reason) => reason.includes('is not above Amazon cost'))) {
  throw new Error(`comparison low eBay price reason missing: ${cheapResult.report.reasons.join(' | ')}`);
}

const strongEbay: EbayCandidateInput[] = [{
  title: 'Tera X100 Wireless Barcode Scanner',
  url: 'https://www.ebay.com/itm/1',
  soldPrice: 120,
  shippingPrice: 0,
  condition: 'New'
}];

const strongResult = analyzeAmazonEbayComparison(amazon, strongEbay, defaultRuleConfig, 'Tera Wireless Barcode Scanner');
assertEqual(strongResult.report.status, 'OPPORTUNITY', 'comparison profitable eBay match status');
assertEqual(strongResult.report.best?.soldPrice, 120, 'comparison profitable best sold price');

const eyoyoAmazon: AmazonMatchInput = {
  ...amazon,
  asin: 'B000EYOYO',
  title: 'Eyoyo Mini 1D Bluetooth Barcode Scanner Wireless USB Wired 2.4G',
  brand: 'Eyoyo',
  buyBoxPrice: 39.99,
  currentPrice: 39.99
};
const uncertainButProfitable = analyzeAmazonEbayComparison(eyoyoAmazon, [{
  title: 'Eyoyo Mini Bluetooth Barcode Scanner Wireless USB Reader',
  url: 'https://www.ebay.de/itm/2',
  soldPrice: 305.99,
  shippingPrice: 0,
  condition: 'New'
}], defaultRuleConfig, 'Eyoyo Mini Bluetooth Barcode Scanner');

assertEqual(uncertainButProfitable.report.status, 'MANUAL_REVIEW', 'comparison high upside uncertain match status');
if (!uncertainButProfitable.report.reasons.some((reason) => reason.includes('promising'))) {
  throw new Error(`comparison manual review reason missing: ${uncertainButProfitable.report.reasons.join(' | ')}`);
}

console.log('amazonDiscoveryComparison unit test passed');
