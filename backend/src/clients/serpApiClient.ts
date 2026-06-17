import { z } from 'zod';
import type { EbayCandidateInput } from '../domain/products.js';

const serpApiEbayResultSchema = z.object({
  id: z.unknown().optional(),
  item_id: z.unknown().optional(),
  itemId: z.unknown().optional(),
  title: z.unknown().optional(),
  link: z.unknown().optional(),
  price: z.unknown().optional(),
  extracted_price: z.unknown().optional(),
  shipping: z.unknown().optional(),
  condition: z.unknown().optional(),
  category: z.unknown().optional(),
  category_id: z.unknown().optional(),
  categoryId: z.unknown().optional(),
  categories: z.array(z.unknown()).optional(),
  extensions: z.array(z.unknown()).optional()
}).passthrough();

const serpApiResponseSchema = z.object({
  error: z.unknown().optional(),
  organic_results: z.array(serpApiEbayResultSchema).nullish(),
  shopping_results: z.array(serpApiEbayResultSchema).nullish()
}).passthrough();

export class SerpApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    const detail = body.trim().slice(0, 300);
    super(detail ? `SerpAPI request failed with status ${status}: ${detail}` : `SerpAPI request failed with status ${status}`);
    this.name = 'SerpApiError';
  }
}

const parseText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ['raw', 'text', 'displayed_value', 'display', 'value', 'name']) {
    const parsed = parseText(record[key]);
    if (parsed) return parsed;
  }
  return undefined;
};

const parseMoney = (value: unknown, depth = 0): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (/free/i.test(value)) return 0;
    const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!match) return undefined;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (!value || typeof value !== 'object' || depth > 3) return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ['extracted_price', 'extracted', 'amount', 'value', 'price', 'raw', 'text', 'display', 'displayed_price']) {
    const parsed = parseMoney(record[key], depth + 1);
    if (parsed !== undefined) return parsed;
  }

  const text = parseText(value);
  if (!text) return undefined;
  const parsed = Number(text.replace(/,/g, '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseCategory = (result: Record<string, unknown>): string | undefined => {
  const direct = parseText(result.category);
  if (direct) return direct;

  const categories = Array.isArray(result.categories)
    ? result.categories.map(parseText).filter((item): item is string => Boolean(item))
    : [];
  if (categories.length > 0) return categories.join(' > ');

  return undefined;
};

const parseEbayItemId = (result: Record<string, unknown>, url: string | undefined): string | undefined => {
  const direct = parseText(result.item_id) ?? parseText(result.itemId) ?? parseText(result.id);
  if (direct) return direct;

  const match = url?.match(/\/itm\/(?:[^/]+\/)?(\d+)/i) ?? url?.match(/[?&]item=(\d+)/i);
  return match?.[1];
};

export interface SerpApiSearchOptions {
  query: string;
  apiKey: string;
  ebayDomain?: string;
  soldOnly?: boolean;
  completedOnly?: boolean;
  resultPageSize?: 25 | 50 | 100 | 200;
  buyingFormat?: 'BIN' | 'Auction' | 'BO';
  conditionIds?: string[];
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  preferredLocation?: 'Domestic' | 'Regional' | 'Worldwide';
  postalCode?: string;
  exactQueryOnly?: boolean;
  limit?: number;
}

function pageSizeForLimit(limit: number | undefined): 25 | 50 | 100 | 200 {
  const value = limit ?? 25;
  if (value <= 25) return 25;
  if (value <= 50) return 50;
  if (value <= 100) return 100;
  return 200;
}

export async function searchEbayCandidates(options: SerpApiSearchOptions): Promise<EbayCandidateInput[]> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 200);
  const params = new URLSearchParams({
    engine: 'ebay',
    _nkw: options.query,
    _ipg: String(options.resultPageSize ?? pageSizeForLimit(limit)),
    api_key: options.apiKey
  });

  if (options.ebayDomain) params.set('ebay_domain', options.ebayDomain);
  const showOnly = [
    (options.soldOnly ?? true) ? 'Sold' : undefined,
    (options.completedOnly ?? true) ? 'Complete' : undefined
  ].filter((item): item is string => Boolean(item));
  if (showOnly.length > 0) params.set('show_only', showOnly.join(','));
  if (options.soldOnly ?? true) {
    params.set('LH_Sold', '1');
  }
  if (options.completedOnly ?? true) {
    params.set('LH_Complete', '1');
  }
  if (options.buyingFormat) params.set('buying_format', options.buyingFormat);
  if (options.conditionIds?.length) params.set('LH_ItemCondition', options.conditionIds.join('|'));
  if (options.categoryId?.trim()) params.set('_sacat', options.categoryId.trim());
  if (options.minPrice !== undefined) params.set('_udlo', String(options.minPrice));
  if (options.maxPrice !== undefined) params.set('_udhi', String(options.maxPrice));
  if (options.preferredLocation) params.set('LH_PrefLoc', options.preferredLocation);
  if (options.postalCode?.trim()) params.set('_stpos', options.postalCode.trim());
  if (options.exactQueryOnly) params.set('_blrs', 'spell_auto_correct');

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) {
    throw new SerpApiError(response.status, await response.text());
  }

  const payload = serpApiResponseSchema.parse(await response.json());
  const payloadError = parseText(payload.error);
  if (payloadError) {
    throw new SerpApiError(502, payloadError);
  }

  const results = [...(payload.organic_results ?? []), ...(payload.shopping_results ?? [])];

  return results.slice(0, limit).flatMap((result) => {
    const title = parseText(result.title);
    if (!title) return [];
    const url = parseText(result.link);

    return [{
      itemId: parseEbayItemId(result, url),
      title,
      url,
      soldPrice: parseMoney(result.extracted_price) ?? parseMoney(result.price),
      shippingPrice: parseMoney(result.shipping),
      condition: parseText(result.condition),
      category: parseCategory(result),
      categoryId: parseText(result.category_id) ?? parseText(result.categoryId),
      raw: result
    }];
  });
}
