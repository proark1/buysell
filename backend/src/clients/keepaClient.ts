import { z } from 'zod';
import type { AmazonMatchInput } from '../domain/products.js';

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();
const nullableNumberArray = z.array(z.number()).nullable().optional();
const keepaProductSchema = z.object({
  asin: z.string(),
  title: nullableString,
  brand: nullableString,
  model: nullableString,
  upcList: z.array(z.string()).nullable().optional(),
  categoryTree: z.array(z.object({ name: nullableString }).passthrough()).nullable().optional(),
  rootCategory: nullableNumber,
  salesRankReference: nullableNumber,
  stats: z.object({
    current: nullableNumberArray,
    buyBoxPrice: nullableNumber,
    avg30: nullableNumberArray,
    avg90: nullableNumberArray
  }).nullable().optional(),
  rating: nullableNumber,
  reviews: z.unknown().optional(),
  reviewCount: nullableNumber,
  availabilityAmazon: nullableNumber,
  csv: z.array(z.array(z.number()).nullable()).nullable().optional(),
  domainId: nullableNumber
}).passthrough();

const keepaResponseSchema = z.object({
  products: z.array(keepaProductSchema).optional()
}).passthrough();

export class KeepaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    const detail = body.trim().slice(0, 300);
    super(detail ? `Keepa request failed with status ${status}: ${detail}` : `Keepa request failed with status ${status}`);
    this.name = 'KeepaApiError';
  }
}

interface KeepaProduct {
  asin: string;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  upcList?: string[] | null;
  salesRankReference?: number | null;
  stats?: {
    current?: number[] | null;
    buyBoxPrice?: number | null;
    avg30?: number[] | null;
    avg90?: number[] | null;
  } | null;
  categoryTree?: { name?: string | null }[] | null;
  rating?: number | null;
  reviews?: unknown;
  reviewCount?: number | null;
  availabilityAmazon?: number | null;
}

const keepaCentsToMoney = (value?: number | null): number | undefined => {
  if (value === undefined || value === null || value < 0) return undefined;
  return Math.round(value) / 100;
};

const nullableText = (value?: string | null): string | undefined => value ?? undefined;

const keepaNumericValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (Array.isArray(value)) {
    return [...value].reverse().find((item): item is number => typeof item === 'number' && Number.isFinite(item) && item >= 0);
  }
  return undefined;
};

const keepaReviewCount = (product: KeepaProduct): number | undefined => {
  const directCount = keepaNumericValue(product.reviewCount);
  if (directCount !== undefined) return directCount;
  const directReviews = keepaNumericValue(product.reviews);
  if (directReviews !== undefined) return directReviews;
  if (product.reviews && typeof product.reviews === 'object') {
    const reviewStats = product.reviews as Record<string, unknown>;
    return keepaNumericValue(reviewStats.reviewCount) ?? keepaNumericValue(reviewStats.ratingCount);
  }
  return undefined;
};

export interface KeepaSearchOptions {
  query: string;
  apiKey: string;
  domain?: number;
  limit?: number;
}

export async function findAmazonMatches(options: KeepaSearchOptions): Promise<AmazonMatchInput[]> {
  const params = new URLSearchParams({
    key: options.apiKey,
    domain: String(options.domain ?? 1),
    type: 'product',
    term: options.query,
    stats: '90',
    history: '0',
    update: '1',
    'asins-only': '0'
  });

  const response = await fetch(`https://api.keepa.com/search?${params.toString()}`);
  if (!response.ok) {
    throw new KeepaApiError(response.status, await response.text());
  }

  const payload = keepaResponseSchema.parse(await response.json());

  return (payload.products ?? []).slice(0, options.limit ?? 10).map((product: KeepaProduct) => {
    const currentPrice = keepaCentsToMoney(product.stats?.current?.[1]);
    const buyBoxPrice = keepaCentsToMoney(product.stats?.buyBoxPrice);
    const avg90Price = keepaCentsToMoney(product.stats?.avg90?.[1]) ?? keepaCentsToMoney(product.stats?.avg30?.[1]);
    const latestPrice = buyBoxPrice ?? currentPrice;
    const priceDropPercent = latestPrice && avg90Price && avg90Price > latestPrice
      ? Math.round(((avg90Price - latestPrice) / avg90Price) * 1000) / 10
      : undefined;
    const categoryTree = product.categoryTree?.flatMap((category) => category.name ? [category.name] : []) ?? [];

    return {
      asin: product.asin,
      title: product.title ?? product.asin,
      url: `https://www.amazon.com/dp/${product.asin}`,
      brand: nullableText(product.brand),
      model: nullableText(product.model),
      upc: product.upcList?.[0],
      currentPrice,
      buyBoxPrice,
      avg90Price,
      priceDropPercent,
      availabilityStatus: product.availabilityAmazon === 0 ? 'IN_STOCK' : 'UNKNOWN',
      salesRank: product.salesRankReference ?? undefined,
      rating: product.rating ?? undefined,
      reviewCount: keepaReviewCount(product),
      categoryTree,
      rootCategory: categoryTree[0],
      matchConfidence: 0,
      raw: product
    };
  });
}
