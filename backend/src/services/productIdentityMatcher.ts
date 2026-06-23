import type { AmazonMatchInput, EbayCandidateInput, OpportunityDecision, ProductIdentityMatch } from '../domain/products.js';
import { isSpecificationToken, modelTokenCandidates } from './tokenPatterns.js';

const knownBrands = new Set([
  '5kind',
  '3m',
  'acme',
  'abtei',
  'av access',
  'anker',
  'apple',
  'ariel',
  'beaphar',
  'bedrop',
  'belkin',
  'bionoble',
  'black+decker',
  'black decker',
  'bosch',
  'brooklyn soap company',
  'brother',
  'canon',
  'caramba',
  'cat s best',
  'cats best',
  'dell',
  'dewalt',
  'dibo',
  'dji',
  'doppelherz',
  'dremel',
  'dymo',
  'eukanuba',
  'epson',
  'eyoyo',
  'febreze',
  'fifine',
  'feintech',
  'floragard',
  'fosi audio',
  'fritz',
  'gulikit',
  'gulitech',
  'fujitsu',
  'garmin',
  'gamestar',
  'homematic',
  'hp',
  'honeywell',
  'kirchhoff',
  'jabra',
  'karcher',
  'kasa',
  'kingston',
  'lenovo',
  'lenor',
  'lewitt',
  'ledvance',
  'liqui moly',
  'logitech',
  'lotus',
  'lotus biscoff',
  'makita',
  'metabo',
  'microsoft',
  'milwaukee',
  'mucar',
  'netgear',
  'nelko',
  'nekton',
  'nintendo',
  'nobsound',
  'nokia',
  'osram',
  'panasonic',
  'phomemo',
  'philips',
  'poly',
  'pronto',
  'presonus',
  'rode',
  'ryobi',
  'sanabelle',
  'samsung',
  'sunday natural',
  'seagate',
  'shure',
  'sonoff',
  'sony',
  'starkey',
  'symbol',
  'tera',
  'teslong',
  'tp-link',
  'tp link',
  'traxxas',
  'ugreen',
  'vdiagtool',
  'veet',
  'very',
  'wera',
  'weightworld',
  'wd',
  'western digital',
  'wolfbox',
  'xtool',
  'xerox',
  'yihua',
  'zoom',
  'zebra'
]);

const genericLeadingWords = new Set([
  'akku',
  'akkus',
  'adapter',
  'battery',
  'batterie',
  'new',
  'neu',
  'used',
  'gebraucht',
  'original',
  'genuine',
  'compatible',
  'wireless',
  'bluetooth',
  'portable',
  'digital',
  'usb',
  'usb-c',
  'mini',
  'barcode',
  'scanner',
  'replacement',
  'ersatz',
  'ersatzteil',
  'for',
  'fur',
  'für',
  'with',
  'ohne',
  'mit',
  'lot',
  'pack',
  'set',
  'kit',
  'pcs',
  'piece',
  'pieces',
  'heavy',
  'duty',
  'profi'
]);

const genericModelTokens = new Set([
  '1D',
  '2D',
  '2G',
  '3G',
  '4G',
  '5G',
  '24G',
  'USB',
  'LED',
  'LCD',
  'HD',
  '4K',
  '1080P',
  '220V',
  '110V',
  '32BIT',
  '64BIT'
]);

const variantWords = new Set([
  'black',
  'white',
  'red',
  'blue',
  'green',
  'yellow',
  'gray',
  'grey',
  'pink',
  'orange',
  'purple',
  'small',
  'medium',
  'large',
  'xl',
  'mini',
  'pro',
  'plus',
  'max',
  'ultra',
  'lite'
]);

const normalize = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || undefined;
};


function normalizeBrand(value: string | undefined): string | undefined {
  const normalized = normalize(value);
  if (!normalized) return undefined;
  const withoutNoisePrefix = normalized.replace(/^(?:brand|store|the|v)\s+/, '');
  const candidate = knownBrands.has(withoutNoisePrefix) ? withoutNoisePrefix : normalized;
  if (['unbranded', 'markenlos', 'does not apply', 'unknown', 'generic', 'none', 'na', 'n a'].includes(candidate)) return undefined;
  if (/^\d/.test(candidate)) return undefined;
  if (candidate.length < 2) return undefined;
  if (genericLeadingWords.has(candidate)) return undefined;
  return candidate;
}

const textContainsToken = (text: string, token: string): boolean => new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`, 'i').test(text);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rawRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function textFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const record = rawRecord(value);
  if (!record) return undefined;
  for (const key of ['value', 'text', 'name', 'raw', 'display', 'displayed_value']) {
    const parsed = textFromUnknown(record[key]);
    if (parsed) return parsed;
  }
  return undefined;
}

function collectRawFieldValues(value: unknown, targetKeys: Set<string>, out: string[] = [], depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectRawFieldValues(item, targetKeys, out, depth + 1);
    return out;
  }
  const record = rawRecord(value);
  if (!record) return out;

  for (const [key, item] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (targetKeys.has(normalizedKey)) {
      if (Array.isArray(item)) {
        for (const nested of item) {
          const parsed = textFromUnknown(nested);
          if (parsed) out.push(parsed);
        }
      } else {
        const parsed = textFromUnknown(item);
        if (parsed) out.push(parsed);
      }
    }
    collectRawFieldValues(item, targetKeys, out, depth + 1);
  }
  return out;
}

function collectRawFieldEntries(value: unknown, targetKeys: Set<string>, out: Array<{ key: string; value: string }> = [], depth = 0): Array<{ key: string; value: string }> {
  if (depth > 4 || value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectRawFieldEntries(item, targetKeys, out, depth + 1);
    return out;
  }
  const record = rawRecord(value);
  if (!record) return out;

  for (const [key, item] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (targetKeys.has(normalizedKey)) {
      if (Array.isArray(item)) {
        for (const nested of item) {
          const parsed = textFromUnknown(nested);
          if (parsed) out.push({ key: normalizedKey, value: parsed });
        }
      } else {
        const parsed = textFromUnknown(item);
        if (parsed) out.push({ key: normalizedKey, value: parsed });
      }
    }
    collectRawFieldEntries(item, targetKeys, out, depth + 1);
  }
  return out;
}

function normalizedIdentifier(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalizedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalizedValue.length >= 4 ? normalizedValue : undefined;
}

function unique(items: Array<string | undefined>): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item)))];
}

const compactQueryPart = (value: string | undefined): string | undefined => {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return undefined;
  return normalizedValue
    .split(' ')
    .filter((word) => word.length > 1 && !['new', 'neu', 'used', 'gebraucht', 'original', 'genuine'].includes(word))
    .join(' ')
    .trim() || undefined;
};

function inferKnownBrand(text: string): string | undefined {
  const normalizedText = normalize(text) ?? '';
  const sortedBrands = [...knownBrands].sort((a, b) => b.length - a.length);
  return sortedBrands.find((brand) => textContainsToken(normalizedText, brand));
}

function inferLeadingBrand(text: string): string | undefined {
  const words = (normalize(text) ?? '').split(' ').filter(Boolean);
  const firstMeaningful = words.find((word) => !genericLeadingWords.has(word));
  if (!firstMeaningful || firstMeaningful.length < 2 || /\d/.test(firstMeaningful)) return undefined;
  return knownBrands.has(firstMeaningful) ? firstMeaningful : undefined;
}

function inferEbayBrand(ebay: EbayCandidateInput): string | undefined {
  const rawBrand = collectRawFieldValues(ebay.raw, new Set(['brand', 'manufacturer'])).map(normalizeBrand).find(Boolean);
  if (rawBrand) return rawBrand;
  return inferKnownBrand(ebay.title) ?? inferLeadingBrand(ebay.title);
}

function amazonBrand(amazon: AmazonMatchInput): string | undefined {
  return normalizeBrand(amazon.brand) ?? inferKnownBrand(amazon.title);
}

function modelTokensFromText(value: string | undefined): string[] {
  return unique(modelTokenCandidates(value))
    .filter((token) => token.length >= 3 && !genericModelTokens.has(token) && !isSpecificationToken(token));
}

function modelTokensFromRaw(raw: unknown): string[] {
  return collectRawFieldValues(raw, new Set(['model', 'modelnumber', 'mpn', 'manufacturerpartnumber', 'partnumber']))
    .flatMap(modelTokensFromText);
}

const barcodeIdentifierKeys = new Set([
  'upc',
  'upcs',
  'upclist',
  'ean',
  'eans',
  'eanlist',
  'gtin',
  'gtins',
  'isbn'
]);

const partIdentifierKeys = new Set([
  'mpn',
  'mpns',
  'manufacturerpartnumber',
  'partnumber',
  'partnumbers',
  'itempartnumber',
  'model',
  'modelnumber',
  'itemmodelnumber'
]);

const ignoredMarketplaceIdentifierKeys = new Set([
  'epid',
  'itemid',
  'itemnumber',
  'legacyitemid',
  'listingid',
  'productid'
]);

const identityIdentifierKeys = new Set([
  ...barcodeIdentifierKeys,
  ...partIdentifierKeys,
  ...ignoredMarketplaceIdentifierKeys
]);

function gtinCheckDigitValid(value: string): boolean {
  const digits = value.split('').map(Number);
  const body = digits.slice(0, -1);
  const check = digits[digits.length - 1];
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const fromRight = body.length - 1 - i;
    sum += body[i] * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

function isbn10CheckDigitValid(value: string): boolean {
  if (value.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const char = value[i];
    const digit = char === 'X' ? 10 : Number(char);
    if (Number.isNaN(digit)) return false;
    sum += (10 - i) * digit;
  }
  return sum % 11 === 0;
}

// Validate the check digit so a coincidental run of digits can't pass as an EXACT
// barcode identity match. X is only valid as the ISBN-10 check position.
function isPlausibleBarcodeIdentifier(value: string): boolean {
  if (!/^[0-9X]+$/.test(value)) return false;
  if (value.includes('X')) return value.length === 10 && value.indexOf('X') === 9 && isbn10CheckDigitValid(value);
  if (value.length === 10) return isbn10CheckDigitValid(value);
  if ([8, 12, 13, 14].includes(value.length)) return gtinCheckDigitValid(value);
  return false;
}

function isPlausiblePartIdentifier(value: string): boolean {
  if (value.length < 4 || value.length > 32) return false;
  if (/^(?:DOESNOTAPPLY|NOTAPPLICABLE|UNKNOWN|NONE|NA|N\/A)$/i.test(value)) return false;
  return /[A-Z0-9]/.test(value);
}

function normalizedIdentifierForKey(key: string, value: string | undefined): string | undefined {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ignoredMarketplaceIdentifierKeys.has(normalizedKey)) return undefined;
  const identifier = normalizedIdentifier(value);
  if (!identifier) return undefined;
  if (barcodeIdentifierKeys.has(normalizedKey)) return isPlausibleBarcodeIdentifier(identifier) ? identifier : undefined;
  if (partIdentifierKeys.has(normalizedKey)) return isPlausiblePartIdentifier(identifier) ? identifier : undefined;
  return undefined;
}

function splitIdentifierValue(value: string): string[] {
  return value
    .split(/[,;|]+/)
    .flatMap((part) => part.trim().split(/\s+(?=[A-Z0-9]{4,}\b)/i))
    .map((part) => part.trim())
    .filter(Boolean);
}

function identifierValues(raw: unknown, direct: Array<{ key: string; value: string | undefined }> = []): string[] {
  const entries = [
    ...direct.flatMap((entry) => entry.value ? splitIdentifierValue(entry.value).map((value) => ({ key: entry.key, value })) : []),
    ...collectRawFieldEntries(raw, identityIdentifierKeys)
      .flatMap((entry) => splitIdentifierValue(entry.value).map((value) => ({ key: entry.key, value })))
  ];
  return unique(entries.map((entry) => normalizedIdentifierForKey(entry.key, entry.value)));
}

function packCount(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.toLowerCase();
  const match = text.match(/\b(\d+)\s*(?:pcs?|pieces?|pack|packs|count|ct|x|units?)\b|\bpack\s*of\s*(\d+)\b|\b(\d+)\s*x\s/i);
  const count = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  return Number.isFinite(count) && count > 1 ? count : undefined;
}

function packCountFromRaw(raw: unknown): number | undefined {
  const values = collectRawFieldValues(raw, new Set([
    'packcount',
    'packagequantity',
    'itempackagequantity',
    'numberofitems',
    'unitcount',
    'count'
  ]));
  return values.map(packCount).find((value): value is number => value !== undefined);
}

function variantTokens(value: string | undefined): string[] {
  const words = (normalize(value) ?? '').split(' ').filter(Boolean);
  const storage = words.filter((word) => /^\d+(?:gb|tb|mb)$/.test(word));
  const size = words.filter((word) => /^\d+(?:mm|cm|inch|in|oz|ml|l)$/.test(word));
  return unique([...words.filter((word) => variantWords.has(word)), ...storage, ...size]);
}

export interface EbayIdentityFingerprint {
  brand?: string;
  modelTokens: string[];
  identifiers: string[];
  variantTokens: string[];
  packCount?: number;
  searchQueries: string[];
}

export function extractEbayIdentityFingerprint(ebay: EbayCandidateInput): EbayIdentityFingerprint {
  const brand = inferEbayBrand(ebay);
  const modelTokens = unique([
    ...modelTokensFromText(ebay.title),
    ...modelTokensFromRaw(ebay.raw)
  ]);
  const identifiers = identifierValues(ebay.raw);
  const variants = variantTokens(ebay.title);
  const pack = packCount(ebay.title) ?? packCountFromRaw(ebay.raw);
  const titleFallback = compactQueryPart(ebay.title);
  const searchQueries = unique([
    ...identifiers.slice(0, 2).flatMap((identifier) => [
      compactQueryPart([brand, identifier].filter(Boolean).join(' ')),
      compactQueryPart(identifier)
    ]),
    brand && modelTokens.length ? compactQueryPart([brand, ...modelTokens.slice(0, 2)].join(' ')) : undefined,
    // Use variant words (color/size/spec) ONLY to refine a model-bearing query — never as the
    // sole discriminator. A brand+variant query like "dymo white" matched the wrong product
    // (DYMO tape, not the LetraTag printer) and the search short-circuits on the first hit, so
    // the full-title fallback below was never reached. With no model token, skip straight to it.
    brand && modelTokens.length && variants.length
      ? compactQueryPart([brand, modelTokens[0], variants[0]].join(' '))
      : undefined,
    titleFallback
  ]).slice(0, 3);

  return {
    brand,
    modelTokens,
    identifiers,
    variantTokens: variants,
    packCount: pack,
    searchQueries
  };
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function titleOverlap(ebay: EbayCandidateInput, amazon: AmazonMatchInput): number {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'new', 'used', 'brand', 'wireless', 'bluetooth', 'usb']);
  const words = (value: string): Set<string> => new Set((normalize(value) ?? '')
    .split(' ')
    .filter((word) => word.length >= 3 && !stopWords.has(word)));
  const ebayWords = words(ebay.title);
  const amazonWords = words(amazon.title);
  const union = new Set([...ebayWords, ...amazonWords]);
  if (!union.size) return 0;
  return [...ebayWords].filter((word) => amazonWords.has(word)).length / union.size;
}

export function evaluateProductIdentity(ebay: EbayCandidateInput, amazon: AmazonMatchInput): ProductIdentityMatch {
  const evidence: string[] = [];
  const conflicts: string[] = [];
  const riskFlags: string[] = [];
  const normalizedEbayBrand = inferEbayBrand(ebay);
  const normalizedAmazonBrand = amazonBrand(amazon);
  const ebayModelTokens = unique([
    ...modelTokensFromText(ebay.title),
    ...modelTokensFromRaw(ebay.raw)
  ]);
  const amazonModelTokens = unique([
    ...modelTokensFromText(amazon.model),
    ...modelTokensFromText(amazon.title)
  ]);
  const ebayIdentifiers = identifierValues(ebay.raw);
  const amazonIdentifiers = identifierValues(amazon.raw, [
    { key: 'upc', value: amazon.upc },
    { key: 'model', value: amazon.model }
  ]);
  const sharedIdentifiers = intersection(ebayIdentifiers, amazonIdentifiers);
  const sharedModels = intersection(ebayModelTokens, amazonModelTokens);

  if (sharedIdentifiers.length > 0) {
    evidence.push(`Shared product identifier: ${sharedIdentifiers[0]}.`);
  }

  if (normalizedAmazonBrand && sharedIdentifiers.length === 0) {
    if (normalizedEbayBrand === normalizedAmazonBrand || textContainsToken(normalize(ebay.title) ?? '', normalizedAmazonBrand)) {
      evidence.push(`Brand matched: ${normalizedAmazonBrand}.`);
    } else if (normalizedEbayBrand) {
      conflicts.push(`Brand mismatch: eBay appears to be "${normalizedEbayBrand}", Amazon is "${normalizedAmazonBrand}".`);
      riskFlags.push('BRAND_MISMATCH');
    } else {
      conflicts.push(`Amazon brand "${normalizedAmazonBrand}" was not verified in the eBay listing.`);
      riskFlags.push('BRAND_NOT_VERIFIED');
    }
  } else {
    if (sharedIdentifiers.length === 0) {
      conflicts.push('Amazon brand is missing, so brand equality cannot be verified.');
      riskFlags.push('BRAND_NOT_VERIFIED');
    } else if (normalizedAmazonBrand) {
      evidence.push(`Amazon brand captured: ${normalizedAmazonBrand}.`);
    }
  }

  if (sharedModels.length > 0) {
    evidence.push(`Model matched: ${sharedModels[0]}.`);
  } else if (sharedIdentifiers.length === 0 && ebayModelTokens.length > 0 && amazonModelTokens.length > 0) {
    conflicts.push(`Model mismatch: eBay has ${ebayModelTokens.join(', ')}, Amazon has ${amazonModelTokens.join(', ')}.`);
    riskFlags.push('MODEL_MISMATCH');
  } else if (sharedIdentifiers.length === 0 && (amazonModelTokens.length > 0 || ebayModelTokens.length > 0)) {
    conflicts.push('Model number is present on only one side, so exact model equality is not proven.');
    riskFlags.push('MODEL_NOT_VERIFIED');
  }

  const ebayPack = packCount(ebay.title) ?? packCountFromRaw(ebay.raw);
  const amazonPack = packCount(amazon.title) ?? packCountFromRaw(amazon.raw);
  if (ebayPack && amazonPack && ebayPack !== amazonPack) {
    conflicts.push(`Pack count mismatch: eBay appears to be ${ebayPack}, Amazon appears to be ${amazonPack}.`);
    riskFlags.push('BUNDLE_OR_QUANTITY_MISMATCH');
  } else if (ebayPack && !amazonPack) {
    conflicts.push(`eBay appears to be a ${ebayPack}-pack or lot, but Amazon pack count is not verified.`);
    riskFlags.push('BUNDLE_OR_QUANTITY_MISMATCH');
  }

  const ebayVariants = variantTokens(ebay.title);
  const amazonVariants = variantTokens(amazon.title);
  const variantConflict = ebayVariants.length > 0
    && amazonVariants.length > 0
    && intersection(ebayVariants, amazonVariants).length === 0;
  if (variantConflict) {
    conflicts.push(`Variant mismatch: eBay has ${ebayVariants.join(', ')}, Amazon has ${amazonVariants.join(', ')}.`);
    riskFlags.push('VARIANT_MISMATCH');
  }

  const brandConflict = riskFlags.includes('BRAND_MISMATCH');
  const modelConflict = riskFlags.includes('MODEL_MISMATCH');
  const hardVariantConflict = riskFlags.includes('BUNDLE_OR_QUANTITY_MISMATCH') || riskFlags.includes('VARIANT_MISMATCH');
  const hasBrandEvidence = evidence.some((item) => item.startsWith('Brand matched'));
  const hasModelEvidence = sharedModels.length > 0;
  const overlap = titleOverlap(ebay, amazon);

  let status: ProductIdentityMatch['status'];
  let confidence: number;

  if (brandConflict || modelConflict || hardVariantConflict) {
    status = 'REJECT';
    confidence = 0.05;
    if (!riskFlags.includes('PRODUCT_IDENTITY_CONFLICT')) riskFlags.push('PRODUCT_IDENTITY_CONFLICT');
  } else if (sharedIdentifiers.length > 0 && !brandConflict && !modelConflict) {
    status = 'EXACT';
    confidence = hasBrandEvidence ? 0.98 : 0.95;
    if (!hasBrandEvidence) evidence.push('Shared identifier matched across marketplaces.');
  } else if (hasBrandEvidence && hasModelEvidence) {
    status = 'STRONG';
    confidence = 0.9;
  } else if (hasBrandEvidence && overlap >= 0.75 && ebayModelTokens.length === 0 && amazonModelTokens.length === 0) {
    status = 'REVIEW';
    confidence = 0.62;
    riskFlags.push('PRODUCT_IDENTITY_UNVERIFIED');
    conflicts.push('Brand and title are similar, but no model or identifier proves this is the exact product.');
  } else {
    status = 'REVIEW';
    confidence = Math.max(0.35, Math.min(0.6, overlap));
    riskFlags.push('PRODUCT_IDENTITY_UNVERIFIED');
    if (!conflicts.length) conflicts.push('Exact product identity is not proven by brand plus model or identifier evidence.');
  }

  const finalRiskFlags = status === 'EXACT' && sharedIdentifiers.length > 0
    ? riskFlags.filter((flag) => flag !== 'BRAND_NOT_VERIFIED' && flag !== 'MODEL_NOT_VERIFIED' && flag !== 'PRODUCT_IDENTITY_UNVERIFIED')
    : riskFlags;
  const finalConflicts = status === 'EXACT' && sharedIdentifiers.length > 0
    ? conflicts.filter((conflict) => !/not verified|not proven|cannot be verified/i.test(conflict))
    : conflicts;

  return {
    status,
    confidence,
    evidence: unique(evidence),
    conflicts: unique(finalConflicts),
    riskFlags: unique(finalRiskFlags),
    normalized: {
      ebayBrand: normalizedEbayBrand,
      amazonBrand: normalizedAmazonBrand,
      ebayModelTokens,
      amazonModelTokens,
      ebayIdentifiers,
      amazonIdentifiers,
      ebayVariantTokens: ebayVariants,
      amazonVariantTokens: amazonVariants,
      ebayPackCount: ebayPack,
      amazonPackCount: amazonPack
    }
  };
}

export function applyIdentityDecision(
  decision: OpportunityDecision,
  identity: ProductIdentityMatch
): OpportunityDecision {
  const riskFlags = unique([...decision.riskFlags, ...identity.riskFlags]);

  if (identity.status === 'REJECT') {
    return {
      decision: 'REJECT',
      confidence: Math.max(decision.confidence, 0.95),
      riskFlags,
      reasoningSummary: `Rejected because product identity conflicts were found: ${identity.conflicts.join(' ')}`
    };
  }

  if (identity.status === 'REVIEW' && decision.decision !== 'REJECT') {
    return {
      decision: 'MANUAL_REVIEW',
      confidence: Math.min(decision.confidence, 0.6),
      riskFlags,
      reasoningSummary: `Exact product identity is not proven: ${identity.conflicts.join(' ')}`
    };
  }

  if (identity.status === 'EXACT' || identity.status === 'STRONG') {
    return {
      ...decision,
      riskFlags,
      reasoningSummary: `${decision.reasoningSummary} Product identity ${identity.status.toLowerCase()}: ${identity.evidence.join(' ')}`
    };
  }

  return { ...decision, riskFlags };
}
