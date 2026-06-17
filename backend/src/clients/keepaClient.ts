import { z } from 'zod';
import type { AmazonMatchInput } from '../domain/products.js';

const keepaProductSchema = z.object({
  asin: z.string(),
  title: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  upcList: z.array(z.string()).optional(),
  salesRankReference: z.number().optional(),
  stats: z.object({
    current: z.array(z.number()).optional(),
    buyBoxPrice: z.number().optional()
  }).optional(),
  availabilityAmazon: z.number().optional(),
  csv: z.array(z.array(z.number()).nullable()).optional(),
  domainId: z.number().optional()
}).passthrough();

const keepaResponseSchema = z.object({
  products: z.array(keepaProductSchema).optional()
}).passthrough();

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
  };
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
    term: options.query,
    stats: '90',
    offers: '20'
  });

  const response = await fetch(`https://api.keepa.com/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Keepa request failed with status ${response.status}`);
  }

  const payload = keepaResponseSchema.parse(await response.json());

  return (payload.products ?? []).slice(0, options.limit ?? 10).map((product: KeepaProduct) => {
    const currentPrice = keepaCentsToMoney(product.stats?.current?.[1]);
    const buyBoxPrice = keepaCentsToMoney(product.stats?.buyBoxPrice);

    return {
      asin: product.asin,
      title: product.title ?? product.asin,
      url: `https://www.amazon.com/dp/${product.asin}`,
      brand: product.brand,
      model: product.model,
      upc: product.upcList?.[0],
      currentPrice,
      buyBoxPrice,
      availabilityStatus: product.availabilityAmazon === 0 ? 'IN_STOCK' : 'UNKNOWN',
      salesRank: product.salesRankReference,
      matchConfidence: 0,
      raw: product
    };
  });
}
