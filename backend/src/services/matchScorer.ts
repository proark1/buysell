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
  'wireless',
  'bluetooth',
  'usb',
  'black',
  'white'
]);

const normalizeWords = (value: string): Set<string> => new Set(
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word))
);

const tokenKey = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const modelTokens = (value: string | undefined): string[] => {
  if (!value) return [];
  const matches = value.match(/\b[A-Z]{1,6}[-_/ ]?\d{2,6}[A-Z0-9]{0,5}\b|\b\d{2,6}[-_/ ]?[A-Z]{1,5}\b/gi) ?? [];
  return [...new Set(matches.map(tokenKey).filter((token) => token.length >= 3))];
};

const packCount = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const match = value.toLowerCase().match(/\b(\d+)\s*(?:pcs?|pieces?|pack|packs|count|ct|x)\b|\bpack\s*of\s*(\d+)\b|\b(\d+)\s*x\s/i);
  const count = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  return Number.isFinite(count) && count > 1 ? count : undefined;
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
  const ebayTitle = ebay.title.toLowerCase();
  const brandScore = amazon.brand && ebayTitle.includes(amazon.brand.toLowerCase()) ? 0.18 : amazon.brand ? -0.08 : 0;
  const ebayModels = modelTokens(ebay.title);
  const amazonModels = [...new Set([...modelTokens(amazon.model), ...modelTokens(amazon.title)])];
  const modelOverlap = overlap(ebayModels, amazonModels);
  const modelScore = modelOverlap > 0 ? 0.27 * modelOverlap : ebayModels.length && amazonModels.length ? -0.2 : 0;
  const ebayPack = packCount(ebay.title);
  const amazonPack = packCount(amazon.title);
  const packPenalty = ebayPack && amazonPack && ebayPack !== amazonPack ? 0.25 : ebayPack && !amazonPack ? 0.12 : 0;

  const positiveScore = Math.min(1, titleScore + brandScore + modelScore);
  return Math.max(0, Math.min(1, Math.round((positiveScore - packPenalty) * 1000) / 1000));
}
