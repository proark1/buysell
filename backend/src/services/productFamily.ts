import type { EbayCandidateInput } from '../domain/products.js';

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
  'with',
  'without',
  'for',
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
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .split(/\s+/)
  .map((token) => token.trim())
  .filter((token) => token.length >= 2 && !productFamilyStopWords.has(token));

export function productFamilyKeyForEbayCandidate(ebay: EbayCandidateInput): string {
  const tokens = normalizeFamilyText(ebay.title);
  const modelTokens = tokens.filter((token) => /\d/.test(token) && /[a-z]/i.test(token) && token.length >= 3);
  if (modelTokens.length > 0) {
    const firstModelIndex = tokens.findIndex((token) => token === modelTokens[0]);
    const brandCandidate = firstModelIndex > 0 ? tokens[firstModelIndex - 1] : tokens[0];
    return [brandCandidate, ...modelTokens.slice(0, 3)].filter(Boolean).join(':').slice(0, 120);
  }
  return tokens.slice(0, 7).join(':').slice(0, 120) || ebay.title.toLowerCase().slice(0, 120);
}
