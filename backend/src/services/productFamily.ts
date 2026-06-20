import type { EbayCandidateInput } from '../domain/products.js';
import { isSpecificationToken, tokenKey } from './tokenPatterns.js';

const productFamilyStopWords = new Set([
  'new',
  'neu',
  'sealed',
  'genuine',
  'original',
  'used',
  'gebraucht',
  'open',
  'box',
  'refurbished',
  'renewed',
  'parts',
  'defect',
  'defekt',
  'adapter',
  'akku',
  'akkus',
  'battery',
  'batterie',
  'compatible',
  'replacement',
  'ersatz',
  'ersatzteil',
  'with',
  'without',
  'for',
  'fur',
  'für',
  'and',
  'the',
  'free',
  'shipping',
  'versand',
  'inkl',
  'incl',
  'lot',
  'pack',
  'pcs',
  'piece',
  'pieces',
  'set',
  'kit',
  'black',
  'white',
  'red',
  'blue',
  'green',
  'silver',
  'grey',
  'gray'
]);

const normalizeFamilyText = (value: string): string[] => value
  .toLowerCase()
  .replace(/ø/g, 'o')
  .replace(/æ/g, 'ae')
  .replace(/œ/g, 'oe')
  .replace(/ß/g, 'ss')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .split(/\s+/)
  .map((token) => token.trim())
  .filter((token) => token.length >= 2 && !productFamilyStopWords.has(token));

function isSpecificationModelToken(token: string): boolean {
  const key = tokenKey(token);
  // Shared spec patterns, plus the weight units (KG/G) this stage additionally treats as specs.
  return isSpecificationToken(key) || /^\d{2,6}(?:KG|G)$/.test(key);
}

export function productFamilyKeyForEbayCandidate(ebay: EbayCandidateInput): string {
  const tokens = normalizeFamilyText(ebay.title);
  const modelTokens = tokens.filter((token) => /\d/.test(token) && /[a-z]/i.test(token) && token.length >= 3 && !isSpecificationModelToken(token));
  if (modelTokens.length > 0) {
    const firstModelIndex = tokens.findIndex((token) => token === modelTokens[0]);
    const brandCandidate = firstModelIndex > 0 ? tokens[firstModelIndex - 1] : tokens[0];
    // Sort + de-dupe the model tokens so the same product in a different title word order
    // yields the same family key (prevents fragmenting learning/aggregation).
    const stableModelTokens = [...new Set(modelTokens)].sort().slice(0, 3);
    return [brandCandidate, ...stableModelTokens].filter(Boolean).join(':').slice(0, 120);
  }
  return tokens.slice(0, 7).join(':').slice(0, 120) || ebay.title.toLowerCase().slice(0, 120);
}
