import { evaluateProductIdentity, applyIdentityDecision, extractEbayIdentityFingerprint } from './productIdentityMatcher.js';
import { assertEqual, assertIncludes } from './testHelpers.js';
import type { AmazonMatchInput, EbayCandidateInput, OpportunityDecision } from '../domain/products.js';

const ebayExact: EbayCandidateInput = {
  title: 'Tera X100 Wireless Barcode Scanner Black',
  soldPrice: 119.99,
  raw: { item_specifics: { Brand: 'Tera' } }
};

const amazonExact: AmazonMatchInput = {
  asin: 'B000X100',
  title: 'Tera X100 Wireless Barcode Scanner Black',
  brand: 'Tera',
  model: 'X100',
  upc: '123456789012',
  currentPrice: 45,
  matchConfidence: 0
};

const strong = evaluateProductIdentity(ebayExact, amazonExact);
assertEqual(strong.status, 'STRONG', 'brand plus model identity status');
if (strong.confidence < 0.85) throw new Error(`expected strong identity confidence, got ${strong.confidence}`);

const ebayUpc: EbayCandidateInput = {
  title: 'Tera X100 Wireless Barcode Scanner Black',
  soldPrice: 119.99,
  raw: { upc: '123456789012', brand: 'Tera' }
};
const exact = evaluateProductIdentity(ebayUpc, amazonExact);
assertEqual(exact.status, 'EXACT', 'shared UPC identity status');

const fingerprint = extractEbayIdentityFingerprint({
  title: 'Wera Drehmomentschlüssel Click-Torque A 6 Set 1/4 Zoll',
  soldPrice: 189.9,
  raw: { item_specifics: { Brand: 'Wera', MPN: '05075691001' } }
});
assertEqual(fingerprint.brand, 'wera', 'fingerprint brand');
assertIncludes(fingerprint.identifiers, '05075691001', 'fingerprint MPN');
assertEqual(fingerprint.searchQueries[0], 'wera 05075691001', 'fingerprint identifier-first search query');

const listingIdFingerprint = extractEbayIdentityFingerprint({
  itemId: '397179669989',
  title: 'Dell Thunderbolt Dock WD19TB 180W, DELL-WD19TB (180W)',
  soldPrice: 120,
  raw: {
    product_id: '397179669989',
    epid: '23067342330',
    link: 'https://www.ebay.de/itm/397179669989'
  }
});
assertEqual(listingIdFingerprint.brand, 'dell', 'fingerprint infers observed eBay brand');
assertEqual(listingIdFingerprint.identifiers.includes('397179669989'), false, 'fingerprint ignores eBay listing product_id');
assertEqual(listingIdFingerprint.identifiers.includes('23067342330'), false, 'fingerprint ignores eBay catalog epid');
assertEqual(listingIdFingerprint.searchQueries[0], 'dell wd19tb', 'fingerprint falls back to brand-model query after marketplace IDs are ignored');

const mixedIdentifierFingerprint = extractEbayIdentityFingerprint({
  title: 'Wera Drehmomentschlüssel Click-Torque A 6 Set 1/4 Zoll',
  soldPrice: 189.9,
  raw: {
    product_id: '397179669989',
    item_specifics: { Brand: 'Wera', MPN: '05075691001' }
  }
});
assertEqual(mixedIdentifierFingerprint.searchQueries[0], 'wera 05075691001', 'trusted MPN remains first even when product_id is present');

const rawIdentifierExact = evaluateProductIdentity(
  {
    title: 'Tera X100 Wireless Barcode Scanner Black',
    soldPrice: 119.99,
    raw: { item_specifics: { EAN: ['123456789012'], Color: 'Black' } }
  },
  {
    ...amazonExact,
    brand: undefined,
    raw: { eanList: ['123456789012'], itemPackageQuantity: 1 }
  }
);
assertEqual(rawIdentifierExact.status, 'EXACT', 'shared raw identifier array status');

const packMismatch = evaluateProductIdentity(
  {
    title: 'Tera X100 Wireless Barcode Scanner 2 Pack',
    soldPrice: 199.99,
    raw: { item_specifics: { Brand: 'Tera' } }
  },
  amazonExact
);
assertEqual(packMismatch.status, 'REJECT', 'pack mismatch rejects identity');
assertIncludes(packMismatch.riskFlags, 'BUNDLE_OR_QUANTITY_MISMATCH', 'pack mismatch flag');

const brandMismatch = evaluateProductIdentity(
  { title: 'Eyoyo X100 Wireless Barcode Scanner', soldPrice: 120 },
  amazonExact
);
assertEqual(brandMismatch.status, 'REJECT', 'brand mismatch identity status');
assertIncludes(brandMismatch.riskFlags, 'BRAND_MISMATCH', 'brand mismatch flag');

const modelMismatch = evaluateProductIdentity(
  { title: 'Tera X200 Wireless Barcode Scanner', soldPrice: 120 },
  amazonExact
);
assertEqual(modelMismatch.status, 'REJECT', 'model mismatch identity status');
assertIncludes(modelMismatch.riskFlags, 'MODEL_MISMATCH', 'model mismatch flag');

const unverified = evaluateProductIdentity(
  { title: 'Tera Wireless Barcode Scanner Black', soldPrice: 120 },
  { ...amazonExact, model: undefined, title: 'Tera Wireless Barcode Scanner Black' }
);
assertEqual(unverified.status, 'REVIEW', 'brand-only identity status');
assertIncludes(unverified.riskFlags, 'PRODUCT_IDENTITY_UNVERIFIED', 'unverified identity flag');

const genericLeadingWord = evaluateProductIdentity(
  { title: 'Akku 7600mAh Battery Replacement for Zoom Recorder', soldPrice: 120 },
  { ...amazonExact, asin: 'B000ZOOM', title: 'Zoom Recorder Battery Replacement', brand: 'Zoom', model: undefined }
);
assertEqual(genericLeadingWord.status, 'REVIEW', 'generic leading word should not create brand mismatch');
if (genericLeadingWord.riskFlags.includes('BRAND_MISMATCH')) throw new Error('generic leading word produced BRAND_MISMATCH');
if (genericLeadingWord.normalized.ebayModelTokens.includes('7600MAH')) throw new Error('capacity token should not be treated as eBay model');

const numericPrefix = evaluateProductIdentity(
  { title: '800KG Electric Hoist Lift Remote Control', soldPrice: 220 },
  { ...amazonExact, asin: 'B000HOIST', title: 'Electric Hoist Lift Remote Control', brand: 'Acme', model: undefined }
);
assertEqual(numericPrefix.status, 'REVIEW', 'numeric title prefix should not create brand mismatch');
if (numericPrefix.riskFlags.includes('BRAND_MISMATCH')) throw new Error('numeric prefix produced BRAND_MISMATCH');

const diacriticBrand = evaluateProductIdentity(
  { title: 'Rode Wireless Microphone System', soldPrice: 180 },
  { ...amazonExact, asin: 'B000RODE', title: 'RODE Wireless Microphone System', brand: 'RØDE', model: undefined }
);
if (!diacriticBrand.evidence.some((item) => item.includes('Brand matched: rode'))) {
  throw new Error(`expected RØDE brand normalization evidence, got ${diacriticBrand.evidence.join(' | ')}`);
}

const baseDecision: OpportunityDecision = {
  decision: 'LIST',
  confidence: 0.9,
  riskFlags: [],
  reasoningSummary: 'Candidate passes gates.'
};

assertEqual(applyIdentityDecision(baseDecision, exact).decision, 'LIST', 'exact identity keeps list decision');
assertEqual(applyIdentityDecision(baseDecision, unverified).decision, 'MANUAL_REVIEW', 'unverified identity routes to review');
assertEqual(applyIdentityDecision(baseDecision, brandMismatch).decision, 'REJECT', 'identity conflict rejects');

console.log('productIdentityMatcher unit test passed');
