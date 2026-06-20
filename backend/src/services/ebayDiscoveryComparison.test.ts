import {
  analyzeEbayAmazonComparison,
  amazonSearchQueriesForEbayProduct,
  buildEbayDiscoveryCandidates,
  productFamilyKeyForEbayCandidate,
  scoreEbayDiscoveryCandidate,
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

// Amazon costs MORE than the eBay sold price ($120), so even under the no-fee breakeven model
// the spread is negative and the candidate must still be rejected (profit < 0).
const expensiveAmazon: AmazonMatchInput = {
  asin: 'B000EXP',
  title: 'Tera Wireless Barcode Scanner',
  buyBoxPrice: 140,
  currentPrice: 140,
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

const identifierQueries = amazonSearchQueriesForEbayProduct({
  ...ebay,
  title: 'Wera Drehmomentschlüssel Click-Torque A 6 Set 1/4 Zoll',
  raw: { item_specifics: { Brand: 'Wera', MPN: '05075691001' } }
});
assertEqual(identifierQueries[0], 'wera 05075691001', 'eBay comparison searches Amazon by brand and identifier first');

const ebayMarketplaceIdQueries = amazonSearchQueriesForEbayProduct({
  ...ebay,
  itemId: '397179669989',
  title: 'Dell Thunderbolt Dock WD19TB 180W, DELL-WD19TB (180W)',
  raw: {
    product_id: '397179669989',
    epid: '23067342330',
    link: 'https://www.ebay.de/itm/397179669989'
  }
});
assertEqual(ebayMarketplaceIdQueries.some((query) => query.includes('397179669989') || query.includes('23067342330')), false, 'eBay comparison excludes marketplace IDs from Amazon queries');
assertEqual(ebayMarketplaceIdQueries[0], 'dell wd19tb', 'eBay comparison falls back to brand-model query after marketplace IDs are ignored');

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

const highMarginWeakResult = analyzeEbayAmazonComparison(
  {
    title: 'Bremsenentlüfter und Kupplungsentlüftungsgerät 3 in1 mit Akku und Adapter Set',
    soldPrice: 189,
    condition: 'New'
  },
  [{
    asin: 'B000BRAKE',
    title: 'YaoFaFa Bremsenentlüftungsgerät 3L Bremsflüssigkeitswechselgerät Auto Bremsenentlüfter Set mit E20 Adapter',
    brand: 'YaoFaFa',
    buyBoxPrice: 28.89,
    currentPrice: 28.89,
    availabilityStatus: 'UNKNOWN',
    categoryTree: ['Automotive'],
    matchConfidence: 0
  }],
  defaultRuleConfig,
  'Bremsenentlüfter'
);
assertEqual(highMarginWeakResult.report.status, 'MANUAL_REVIEW', 'high-margin weak identity match routes to manual review');

const hardVariantResult = analyzeEbayAmazonComparison(
  {
    title: 'Endoskop Kamera 4Weg 360 5 zoll HD Gelenkendoskop 6.25mm Lens',
    soldPrice: 194.99,
    condition: 'New'
  },
  [{
    asin: 'B000SCOPE',
    title: 'Endoskopkamera mit Licht Ennovor 1920P HD Dual Lens 8mm',
    brand: 'Ennovor',
    buyBoxPrice: 50.99,
    currentPrice: 50.99,
    availabilityStatus: 'UNKNOWN',
    categoryTree: ['Tools'],
    matchConfidence: 0
  }],
  defaultRuleConfig,
  'Endoskop Kamera'
);
assertEqual(hardVariantResult.report.status, 'REJECTED', 'hard variant mismatch remains rejected');

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

// Sourceability ranking: an identifiable branded/model-bearing listing must outrank an
// unidentifiable generic commodity, so the compare queue prioritizes arbitrageable products.
const scoreOpts = { minSoldPrice: 25, maxSoldPrice: 250 };
const brandedScore = scoreEbayDiscoveryCandidate(
  { title: 'Logitech G502 Hero Gaming Mouse', soldPrice: 60, condition: 'New', category: 'Consumer Electronics', itemId: '1', url: 'https://www.ebay.com/itm/1' },
  scoreOpts,
  []
);
const genericScore = scoreEbayDiscoveryCandidate(
  { title: 'Wireless Gaming Mouse RGB 6 Button', soldPrice: 60, condition: 'New', category: 'Consumer Electronics', itemId: '2', url: 'https://www.ebay.com/itm/2' },
  scoreOpts,
  []
);
if (!(brandedScore.sourceability > genericScore.sourceability)) {
  throw new Error(`expected branded sourceability above generic, got ${brandedScore.sourceability} vs ${genericScore.sourceability}`);
}
if (!(brandedScore.total > genericScore.total)) {
  throw new Error(`expected branded total above generic, got ${brandedScore.total} vs ${genericScore.total}`);
}
// Boost only, never a penalty — an unrecognized-but-real brand must not be dropped below the gate.
assertEqual(genericScore.sourceability, 0, 'unidentifiable generic listing gets no sourceability boost');
assertEqual(brandedScore.sourceability >= 14, true, 'branded + model listing gets the sourceability boost');

// The new sourcing profile targets branded, model-specific products with a higher price/score gate.
const brandedProfile = getEbayDiscoveryProfile('branded-value');
assertEqual(brandedProfile.key, 'branded-value', 'branded-value sourcing profile is retrievable');
assertEqual(brandedProfile.minSoldPrice >= 40, true, 'branded-value uses a higher sold-price floor');
assertEqual(brandedProfile.minEbayScore >= 60, true, 'branded-value uses a higher score gate');

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
    },
    {
      item_id: 'auction-1',
      title: 'Tera X100 Wireless Barcode Scanner Auction',
      link: 'https://www.ebay.com/itm/auction-1',
      price: { raw: '$80.00' },
      condition: 'New',
      extensions: ['3 bids']
    },
    {
      item_id: 'missing-price-1',
      title: 'Tera X100 Wireless Barcode Scanner No Price',
      link: 'https://www.ebay.com/itm/missing-price-1',
      condition: 'New'
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
  assertEqual(grouped.sourceDrops.auctionFormat, 1, 'eBay discovery drops auction rows before persistence');
  assertEqual(grouped.sourceDrops.missingSoldPrice, 1, 'eBay discovery drops rows without sold price before persistence');
  assertEqual(grouped.sourceDropCandidates.length, 2, 'eBay discovery preserves source-dropped rows for diagnostics');
  assertEqual(grouped.sourceDropCandidates[0]?.rejectionReasons.length > 0, true, 'source-dropped row has rejection reasons');
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
