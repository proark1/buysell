import { z } from 'zod';
import type { AmazonMatchInput } from '../domain/products.js';

const keepaProductSchema = z.object({
  asin: z.string(),
  title: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  upcList: z.array(z.string()).optional(),
  categoryTree: z.array(z.object({ name: z.string().optional() }).passthrough()).optional(),
  rootCategory: z.number().optional(),
  salesRankReference: z.number().optional(),
  stats: z.object({
    current: z.array(z.number()).optional(),
    buyBoxPrice: z.number().optional(),
    avg30: z.array(z.number()).optional(),
    avg90: z.array(z.number()).optional()
  }).optional(),
  rating: z.number().optional(),
  reviews: z.number().optional(),
  reviewCount: z.number().optional(),
  availabilityAmazon: z.number().optional(),
  csv: z.array(z.array(z.number()).nullable()).optional(),
  domainId: z.number().optional()
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
  title?: string;
  brand?: string;
  model?: string;
  upcList?: string[];
  salesRankReference?: number;
  stats?: {
    current?: number[];
    buyBoxPrice?: number;
    avg30?: number[];
    avg90?: number[];
  };
  categoryTree?: { name?: string }[];
  rating?: number;
  reviews?: number;
  reviewCount?: number;
  availabilityAmazon?: number;
}

const keepaCentsToMoney = (value?: number): number | undefined => {
  if (value === undefined || value < 0) return undefined;
  return Math.round(value) / 100;
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
      brand: product.brand,
      model: product.model,
      upc: product.upcList?.[0],
      currentPrice,
      buyBoxPrice,
      avg90Price,
      priceDropPercent,
      availabilityStatus: product.availabilityAmazon === 0 ? 'IN_STOCK' : 'UNKNOWN',
      salesRank: product.salesRankReference,
      rating: product.rating,
      reviewCount: product.reviewCount ?? product.reviews,
      categoryTree,
      rootCategory: categoryTree[0],
      matchConfidence: 0,
      raw: product
    };
  });
}
