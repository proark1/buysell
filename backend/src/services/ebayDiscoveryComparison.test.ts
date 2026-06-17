import { analyzeEbayAmazonComparison, selectEbayDiscoveryQueries } from './ebayDiscovery.js';
import { getEbayDiscoveryCategory, getEbayDiscoveryProfile } from './discoveryPolicy.js';
import { defaultRuleConfig } from '../repositories/ruleConfigRepository.js';
import { assertEqual } from './testHelpers.js';
import type { AmazonMatchInput, EbayCandidateInput } from '../domain/products.js';

const ebay: EbayCandidateInput = {
  itemId: '123',
  title: 'Tera X100 Wireless Barcode Scanner',
  url: 'https://www.ebay.com/itm/123',
  soldPrice: 120,
  shippingPrice: 0,
  condition: 'New',
  category: 'Office Products'
};

const noResults = analyzeEbayAmazonComparison(ebay, [], defaultRuleConfig, 'Tera Wireless Barcode Scanner');
assertEqual(noResults.report.status, 'NO_AMAZON_RESULTS', 'eBay discovery no Amazon results status');
assertEqual(noResults.report.reasons[0], 'No Amazon matches were found for this eBay sold listing.', 'eBay discovery no Amazon results reason');

const expensiveAmazon: AmazonMatchInput = {
  asin: 'B000EXP',
  title: 'Tera Wireless Barcode Scanner',
  buyBoxPrice: 115,
  currentPrice: 115,
  availabilityStatus: 'IN_STOCK',
  categoryTree: ['Office Products'],
  matchConfidence: 0
};

const expensiveResult = analyzeEbayAmazonComparison(ebay, [expensiveAmazon], defaultRuleConfig, ebay.title);
assertEqual(expensiveResult.report.status, 'REJECTED', 'eBay discovery expensive Amazon status');
if (!expensiveResult.report.reasons.some((reason) => reason.includes('is not above Amazon cost') || reason.includes('Expected profit'))) {
  throw new Error(`eBay discovery expensive Amazon reason missing: ${expensiveResult.report.reasons.join(' | ')}`);
}

const profitableAmazon: AmazonMatchInput = {
  asin: 'B000SCAN',
  title: 'Tera X100 Wireless Barcode Scanner',
  brand: 'Tera',
  model: 'X100',
  buyBoxPrice: 45,
  currentPrice: 45,
  avg90Price: 70,
  priceDropPercent: 35.7,
  availabilityStatus: 'IN_STOCK',
  salesRank: 12_000,
  rating: 4.5,
  reviewCount: 700,
  rootCategory: 'Office Products',
  categoryTree: ['Office Products'],
  matchConfidence: 0
};

const profitableResult = analyzeEbayAmazonComparison(ebay, [profitableAmazon], defaultRuleConfig, ebay.title);
assertEqual(profitableResult.report.status, 'OPPORTUNITY', 'eBay discovery profitable Amazon status');
assertEqual(profitableResult.report.best?.asin, 'B000SCAN', 'eBay discovery best Amazon ASIN');

const uncertainEbay: EbayCandidateInput = {
  title: 'Tera Wireless Barcode Scanner',
  soldPrice: 150,
  condition: 'New',
  category: 'Office Products'
};

const uncertainAmazon: AmazonMatchInput = {
  ...profitableAmazon,
  asin: 'B000UNCERTAIN',
  title: 'Tera Wireless Barcode Scanner',
  model: undefined
};

const manualResult = analyzeEbayAmazonComparison(uncertainEbay, [uncertainAmazon], defaultRuleConfig, uncertainEbay.title);
assertEqual(manualResult.report.status, 'MANUAL_REVIEW', 'eBay discovery uncertain profitable match status');

const profile = getEbayDiscoveryProfile('starter-safe');
const category = getEbayDiscoveryCategory(profile, 'office-electronics');
const customQueries = selectEbayDiscoveryQueries(profile, category, 'thermal label printer', 10);
assertEqual(customQueries.length, 1, 'custom eBay discovery query count');
assertEqual(customQueries[0], 'thermal label printer', 'custom eBay discovery query');

const seedQueries = selectEbayDiscoveryQueries(profile, category, undefined, 20);
assertEqual(seedQueries.length, 2, 'seed eBay discovery query count');

console.log('ebayDiscoveryComparison unit test passed');
