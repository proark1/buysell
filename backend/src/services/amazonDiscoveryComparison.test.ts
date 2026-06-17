import { analyzeAmazonEbayComparison } from './amazonDiscovery.js';
import { defaultRuleConfig } from '../repositories/ruleConfigRepository.js';
import { assertEqual } from './testHelpers.js';
import type { AmazonMatchInput, EbayCandidateInput } from '../domain/products.js';

const amazon: AmazonMatchInput = {
  asin: 'B000SCAN',
  title: 'Tera Wireless Barcode Scanner',
  brand: 'Tera',
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
  title: 'Tera Wireless Barcode Scanner',
  url: 'https://www.ebay.com/itm/1',
  soldPrice: 120,
  shippingPrice: 0,
  condition: 'New'
}];

const strongResult = analyzeAmazonEbayComparison(amazon, strongEbay, defaultRuleConfig, 'Tera Wireless Barcode Scanner');
assertEqual(strongResult.report.status, 'OPPORTUNITY', 'comparison profitable eBay match status');
assertEqual(strongResult.report.best?.soldPrice, 120, 'comparison profitable best sold price');

console.log('amazonDiscoveryComparison unit test passed');
