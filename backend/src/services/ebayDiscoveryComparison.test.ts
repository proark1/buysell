import {
  analyzeEbayAmazonComparison,
  buildEbayDiscoveryCandidates,
  productFamilyKeyForEbayCandidate,
  selectEbayDiscoveryQueries
} from './ebayDiscovery.js';
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

const sampledMarketResult = analyzeEbayAmazonComparison(ebay, [profitableAmazon], defaultRuleConfig, ebay.title, {
  soldMarketCandidates: [
    ebay,
    { ...ebay, itemId: '124', soldPrice: 118 },
    { ...ebay, itemId: '125', soldPrice: 123 }
  ],
  activeMarketCandidates: [
    { ...ebay, itemId: 'active-1' },
    { ...ebay, itemId: 'active-2' }
  ]
});
assertEqual(sampledMarketResult.best?.marketMetrics?.soldSampleSize, 3, 'eBay discovery uses sold market sample');
assertEqual(sampledMarketResult.best?.marketMetrics?.activeSampleSize, 2, 'eBay discovery uses active market sample');

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

const wideQueries = selectEbayDiscoveryQueries(profile, category, undefined, 20, 'WIDE');
assertEqual(wideQueries.length, 4, 'wide eBay discovery query count');

const manualQueries = selectEbayDiscoveryQueries(profile, category, 'barcode scanner, thermal printer', 10);
assertEqual(manualQueries.length, 2, 'manual eBay discovery query list count');

const familyKey = productFamilyKeyForEbayCandidate({
  title: 'Tera X100 Wireless Barcode Scanner New',
  soldPrice: 75
});
assertEqual(familyKey, 'tera:x100', 'eBay discovery product family key');

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(JSON.stringify({
  organic_results: [
    {
      item_id: 'scan-1',
      title: 'Tera X100 Wireless Barcode Scanner New',
      link: 'https://www.ebay.com/itm/scan-1',
      price: { raw: '$72.00' },
      condition: 'New',
      category: 'Office Products'
    },
    {
      item_id: 'scan-2',
      title: 'Tera X100 2D Barcode Scanner',
      link: 'https://www.ebay.com/itm/scan-2',
      price: { raw: '$78.00' },
      condition: 'New',
      category: 'Office Products'
    },
    {
      item_id: 'label-1',
      title: 'Zebra ZD420 Thermal Label Printer',
      link: 'https://www.ebay.com/itm/label-1',
      price: { raw: '$155.00' },
      condition: 'New',
      category: 'Office Products'
    }
  ]
}), { status: 200 })) as typeof fetch;

try {
  const grouped = await buildEbayDiscoveryCandidates({
    serpApiKey: 'test-key',
    ruleConfig: defaultRuleConfig,
    profileKey: 'starter-safe',
    categoryKey: 'office-electronics',
    query: 'barcode scanner',
    limit: 10,
    minimumEbayScore: 0,
    itemCondition: 'ANY'
  });
  assertEqual(grouped.candidates.length, 2, 'eBay discovery groups duplicate product families');
  const groupedScanner = grouped.candidates.find((candidate) => candidate.family.key === 'tera:x100');
  assertEqual(groupedScanner?.family.soldCount, 2, 'eBay discovery grouped sold count');

  const skipped = await buildEbayDiscoveryCandidates({
    serpApiKey: 'test-key',
    ruleConfig: defaultRuleConfig,
    profileKey: 'starter-safe',
    categoryKey: 'office-electronics',
    query: 'barcode scanner',
    limit: 10,
    minimumEbayScore: 0,
    itemCondition: 'ANY',
    existingProductFamilyKeys: ['tera:x100']
  });
  assertEqual(skipped.skippedExisting, 2, 'eBay discovery skips existing product family items');
  assertEqual(skipped.candidates.length, 1, 'eBay discovery keeps only new product families');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('ebayDiscoveryComparison unit test passed');
