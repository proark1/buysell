import type { AmazonMatchInput, EbayCandidateInput } from '../domain/products.js';

const normalizeWords = (value: string): Set<string> => new Set(
  value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3)
);

export function scoreAmazonMatch(ebay: EbayCandidateInput, amazon: AmazonMatchInput): number {
  const ebayWords = normalizeWords(ebay.title);
  const amazonWords = normalizeWords(amazon.title);
  const intersectionSize = [...ebayWords].filter((word) => amazonWords.has(word)).length;
  const unionSize = new Set([...ebayWords, ...amazonWords]).size;
  const titleScore = unionSize > 0 ? intersectionSize / unionSize : 0;
  const brandScore = amazon.brand && ebay.title.toLowerCase().includes(amazon.brand.toLowerCase()) ? 0.15 : 0;
  const modelScore = amazon.model && ebay.title.toLowerCase().includes(amazon.model.toLowerCase()) ? 0.2 : 0;

  return Math.min(1, Math.round((titleScore + brandScore + modelScore) * 1000) / 1000);
}
