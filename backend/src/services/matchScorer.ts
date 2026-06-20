import type { AmazonMatchInput, EbayCandidateInput } from '../domain/products.js';
import { isSpecificationToken, modelTokenCandidates } from './tokenPatterns.js';

const stopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'new',
  'used',
  'brand',
  'model',
  'compatible',
  'replacement',
  'akku',
  'battery',
  'batterie',
  'wireless',
  'bluetooth',
  'usb',
  'black',
  'white',
  // German grammar + accessory-noise words (titles are normalized to ASCII first, so "für" →
  // "fur"). These previously stayed in the token set and depressed Jaccard overlap on genuine
  // same-product matches between English Amazon and German eBay titles.
  'fur',
  'und',
  'mit',
  'oder',
  'von',
  'der',
  'die',
  'das',
  'den',
  'ein',
  'eine',
  'kompatibel',
  'ersatz',
  'passend',
  'zubehor'
]);

const normalizeText = (value: string): string => value
  .toLowerCase()
  .replace(/ø/g, 'o')
  .replace(/æ/g, 'ae')
  .replace(/œ/g, 'oe')
  .replace(/ß/g, 'ss')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ');

const normalizeWords = (value: string): Set<string> => new Set(
  normalizeText(value)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word))
);

const genericModelTokens = new Set(['1D', '2D', '2G', '3G', '4G', '5G', '24G', 'USB', 'LED', 'LCD', 'HD', '4K', '1080P', '220V', '110V', '32BIT', '64BIT']);
const variantWords = new Set(['black', 'white', 'red', 'blue', 'green', 'yellow', 'gray', 'grey', 'pink', 'orange', 'purple', 'small', 'medium', 'large', 'xl', 'mini', 'pro', 'plus', 'max', 'ultra', 'lite']);

const modelTokens = (value: string | undefined): string[] =>
  [...new Set(modelTokenCandidates(value).filter((token) => token.length >= 3 && !genericModelTokens.has(token) && !isSpecificationToken(token)))];

const packCount = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  // Require an explicit pack noun. The bare "N x" form is intentionally excluded because it
  // matches dimensions/resolutions ("1920 x 1080", "10 x 20 cm") as fake pack counts.
  const match = value.toLowerCase().match(/\b(\d+)\s*(?:pcs?|pieces?|packs?|count|ct)\b|\bpack\s*of\s*(\d+)\b/i);
  const count = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(count) && count > 1 ? count : undefined;
};

// Word-boundary token containment (non-alphanumeric edges) so a brand like "Sony" doesn't
// match inside "Unisony" the way String.includes() would.
const textContainsToken = (haystack: string, token: string): boolean => {
  const trimmed = token.trim();
  if (!trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(haystack);
};

const variantTokens = (value: string | undefined): string[] => {
  if (!value) return [];
  const words = normalizeText(value).split(/\s+/).filter(Boolean);
  const specs = words.filter((word) => /^\d+(?:mah|ah|wh|w|kw|v|a|mm|cm|m|inch|in|gb|tb|mb|dpi|p|k)$/.test(word));
  return [...new Set([...words.filter((word) => variantWords.has(word)), ...specs])];
};

const overlap = (left: string[], right: string[]): number => {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length / new Set([...left, ...right]).size;
};

export function scoreAmazonMatch(ebay: EbayCandidateInput, amazon: AmazonMatchInput): number {
  const ebayWords = normalizeWords(ebay.title);
  const amazonWords = normalizeWords(amazon.title);
  const intersectionSize = [...ebayWords].filter((word) => amazonWords.has(word)).length;
  const unionSize = new Set([...ebayWords, ...amazonWords]).size;
  const titleScore = unionSize > 0 ? intersectionSize / unionSize : 0;
  const ebayTitle = normalizeText(ebay.title);
  const amazonBrand = amazon.brand ? normalizeText(amazon.brand).trim() : undefined;
  const brandScore = amazonBrand && textContainsToken(ebayTitle, amazonBrand) ? 0.18 : amazon.brand ? -0.08 : 0;
  const ebayModels = modelTokens(ebay.title);
  const amazonModels = [...new Set([...modelTokens(amazon.model), ...modelTokens(amazon.title)])];
  const modelOverlap = overlap(ebayModels, amazonModels);
  const modelScore = modelOverlap > 0 ? 0.27 * modelOverlap : ebayModels.length && amazonModels.length ? -0.2 : 0;
  const ebayPack = packCount(ebay.title);
  const amazonPack = packCount(amazon.title);
  const packPenalty = ebayPack && amazonPack && ebayPack !== amazonPack ? 0.25 : ebayPack && !amazonPack ? 0.12 : 0;
  const ebayVariants = variantTokens(ebay.title);
  const amazonVariants = variantTokens(amazon.title);
  const variantOverlap = overlap(ebayVariants, amazonVariants);
  const variantPenalty = ebayVariants.length > 0 && amazonVariants.length > 0 && variantOverlap === 0 ? 0.22 : 0;
  const modelMismatchPenalty = ebayModels.length > 0 && amazonModels.length > 0 && modelOverlap === 0 ? 0.12 : 0;

  const positiveScore = Math.min(1, titleScore + brandScore + modelScore);
  return Math.max(0, Math.min(1, Math.round((positiveScore - packPenalty - variantPenalty - modelMismatchPenalty) * 1000) / 1000));
}
