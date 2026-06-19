import type { AmazonMatchInput, EbayCandidateInput } from '../domain/products.js';

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
  'white'
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

const tokenKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const genericModelTokens = new Set(['1D', '2D', '2G', '3G', '4G', '5G', '24G', 'USB', 'LED', 'LCD', 'HD', '4K', '1080P', '220V', '110V', '32BIT', '64BIT']);
const variantWords = new Set(['black', 'white', 'red', 'blue', 'green', 'yellow', 'gray', 'grey', 'pink', 'orange', 'purple', 'small', 'medium', 'large', 'xl', 'mini', 'pro', 'plus', 'max', 'ultra', 'lite']);

const isSpecificationToken = (token: string): boolean => (
  /^\d{2,6}(?:MAH|AH|WH|W|KW|V|A|MM|CM|M|IN|INCH|HZ|KHZ|MHZ|GHZ|BIT|GB|TB|MB|DPI|P|K)$/.test(token)
  || /^(?:STEREO|MONO|AUDIO|VIDEO)\d{2,6}$/.test(token)
  || /^\d{2,6}(?:PCS|PC|PACK|CT|COUNT)$/.test(token)
);

const modelTokens = (value: string | undefined): string[] => {
  if (!value) return [];
  const matches = value.match(/\b[A-Z]{1,6}[-_/ ]?\d{2,6}[A-Z0-9]{0,5}\b|\b\d{2,6}[-_/ ]?[A-Z]{1,5}\b/gi) ?? [];
  return [...new Set(matches.map(tokenKey).filter((token) => token.length >= 3 && !genericModelTokens.has(token) && !isSpecificationToken(token)))];
};

const packCount = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const match = value.toLowerCase().match(/\b(\d+)\s*(?:pcs?|pieces?|pack|packs|count|ct|x)\b|\bpack\s*of\s*(\d+)\b|\b(\d+)\s*x\s/i);
  const count = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  return Number.isFinite(count) && count > 1 ? count : undefined;
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
  const brandScore = amazonBrand && ebayTitle.includes(amazonBrand) ? 0.18 : amazon.brand ? -0.08 : 0;
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
