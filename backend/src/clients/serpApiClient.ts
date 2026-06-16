import { z } from 'zod';
import type { EbayCandidateInput } from '../domain/products.js';

const serpApiEbayResultSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  extracted_price: z.number().optional(),
  shipping: z.string().optional(),
  condition: z.string().optional(),
  extensions: z.array(z.string()).optional()
}).passthrough();

const serpApiResponseSchema = z.object({
  organic_results: z.array(serpApiEbayResultSchema).optional(),
  shopping_results: z.array(serpApiEbayResultSchema).optional()
}).passthrough();

const parseMoney = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};

export interface SerpApiSearchOptions {
  query: string;
  apiKey: string;
  ebayDomain?: string;
  soldOnly?: boolean;
  limit?: number;
}

export async function searchEbayCandidates(options: SerpApiSearchOptions): Promise<EbayCandidateInput[]> {
  const params = new URLSearchParams({
    engine: 'ebay',
    _nkw: options.query,
    api_key: options.apiKey
  });

  if (options.ebayDomain) params.set('ebay_domain', options.ebayDomain);
  if (options.soldOnly ?? true) {
    params.set('LH_Sold', '1');
    params.set('LH_Complete', '1');
  }

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpApi request failed with status ${response.status}`);
  }

  const payload = serpApiResponseSchema.parse(await response.json());
  const results = [...(payload.organic_results ?? []), ...(payload.shopping_results ?? [])];

  return results.slice(0, options.limit ?? 25).flatMap((result) => {
    const title = result.title?.trim();
    if (!title) return [];

    return [{
      title,
      url: result.link,
      soldPrice: result.extracted_price ?? parseMoney(result.price),
      shippingPrice: parseMoney(result.shipping),
      condition: result.condition,
      raw: result
    }];
  });
}
