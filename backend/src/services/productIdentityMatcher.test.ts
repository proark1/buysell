import { evaluateProductIdentity, applyIdentityDecision } from './productIdentityMatcher.js';
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
