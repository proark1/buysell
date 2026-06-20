import { z } from 'zod';
import type { EbayCandidateInput } from '../domain/products.js';
import { fetchWithRetry } from './httpClient.js';

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

const hasMoneySignal = (value: string): boolean => /[$€£¥]|\b(?:usd|eur|gbp|cad|aud|chf)\b|price|preis|sold for|verkauft/i.test(value);

const parseMoney = (value: unknown, depth = 0): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    if (/free|kostenlos|gratis/i.test(value)) return 0;
    const text = value.replace(/\s/g, '').replace(/[^0-9.,-]/g, '');
    if (!/\d/.test(text)) return undefined;
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let normalized: string;
    if (lastComma >= 0 && lastDot >= 0) {
      const decimal = lastComma > lastDot ? ',' : '.';
      const thousands = decimal === ',' ? /\./g : /,/g;
      normalized = text.replace(thousands, '').replace(decimal, '.');
    } else if (lastComma >= 0) {
      const decimalDigits = text.length - lastComma - 1;
      normalized = decimalDigits > 0 && decimalDigits <= 2
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');
    } else if (lastDot >= 0) {
      const parts = text.split('.');
      const decimalDigits = text.length - lastDot - 1;
      normalized = parts.length > 2 || decimalDigits === 3
        ? text.replace(/\./g, '')
        : text;
    } else {
      normalized = text;
    }
    const parsed = Number(normalized);
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
  return parseMoney(text);
};

const parseMoneyWithSignal = (value: unknown): number | undefined => {
  const text = parseText(value);
  if (!text || !hasMoneySignal(text)) return undefined;
  return parseMoney(text);
};

const moneyKeyPattern = /(price|amount|cost|sold|bid)/i;
const ignoredMoneyKeyPattern = /(shipping|delivery|postage|tax|saving|discount|seller|rating|review|watch|view|quantity|count|time|date|id$|item)/i;

function findNestedMoney(value: unknown, depth = 0): number | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseMoneyWithSignal(item) ?? findNestedMoney(item, depth + 1);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    if (ignoredMoneyKeyPattern.test(key)) continue;
    if (moneyKeyPattern.test(key)) {
      const parsed = parseMoney(item, depth + 1);
      if (parsed !== undefined) return parsed;
    }
  }
  for (const key of ['detected_extensions', 'rich_snippet', 'extensions', 'details']) {
    const parsed = findNestedMoney(record[key], depth + 1);
    if (parsed !== undefined) return parsed;
  }
  for (const [key, item] of Object.entries(record)) {
    if (ignoredMoneyKeyPattern.test(key)) continue;
    if (!item || typeof item !== 'object') continue;
    const parsed = findNestedMoney(item, depth + 1);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

const parseResultPrice = (result: Record<string, unknown>): number | undefined => {
  for (const key of [
    'extracted_price',
    'price',
    'sale_price',
    'sold_price',
    'extracted_sold_price',
    'current_bid',
    'extracted_current_bid',
    'buy_it_now_price',
    'extracted_buy_it_now_price'
  ]) {
    const parsed = parseMoney(result[key]);
    if (parsed !== undefined) return parsed;
  }
  return findNestedMoney(result);
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

const preferredLocationValue: Record<NonNullable<SerpApiSearchOptions['preferredLocation']>, string> = {
  Domestic: '1',
  Worldwide: '2',
  Regional: '3'
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

interface CachedSearch {
  value: EbayCandidateInput[];
  expiresAt: number;
}
// Short-TTL cache so the same eBay search within a discovery/compare pass doesn't re-spend
// SerpApi credits. Keyed by the query parameters (excluding the API key).
const searchCache = new Map<string, CachedSearch>();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

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
  if (options.buyingFormat) {
    params.set('buying_format', options.buyingFormat);
    if (options.buyingFormat === 'BIN') params.set('LH_BIN', '1');
    if (options.buyingFormat === 'Auction') params.set('LH_Auction', '1');
    if (options.buyingFormat === 'BO') params.set('LH_BO', '1');
  }
  if (options.conditionIds?.length) params.set('LH_ItemCondition', options.conditionIds.join('|'));
  if (options.categoryId?.trim()) params.set('category_id', options.categoryId.trim());
  if (options.minPrice !== undefined) params.set('_udlo', String(options.minPrice));
  if (options.maxPrice !== undefined) params.set('_udhi', String(options.maxPrice));
  if (options.preferredLocation) params.set('LH_PrefLoc', preferredLocationValue[options.preferredLocation]);
  if (options.postalCode?.trim()) params.set('_stpos', options.postalCode.trim());
  if (options.exactQueryOnly) params.set('_blrs', 'spell_auto_correct');

  const cacheKey = [...params.entries()].filter(([key]) => key !== 'api_key').map(([key, value]) => `${key}=${value}`).join('&');
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  // The cache stores the full fetched set; each caller slices to its own limit, since two
  // callers can share a cache key (same bucketed _ipg) yet want different result counts.
  if (cached && cached.expiresAt > now) return cached.value.slice(0, limit);

  const response = await fetchWithRetry(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) {
    throw new SerpApiError(response.status, await response.text());
  }

  const payload = serpApiResponseSchema.parse(await response.json());
  const payloadError = parseText(payload.error);
  if (payloadError) {
    throw new SerpApiError(502, payloadError);
  }

  const results = [...(payload.organic_results ?? []), ...(payload.shopping_results ?? [])];

  // Map the full fetched set (not sliced), cache it, then slice to this caller's limit.
  const candidates = results.flatMap((result) => {
    const record = result as Record<string, unknown>;
    const title = parseText(result.title);
    if (!title) return [];
    const url = parseText(result.link);

    return [{
      itemId: parseEbayItemId(record, url),
      title,
      url,
      soldPrice: parseResultPrice(record),
      shippingPrice: parseMoney(result.shipping),
      condition: parseText(record.condition),
      category: parseCategory(record),
      categoryId: parseText(record.category_id) ?? parseText(record.categoryId),
      raw: result
    }];
  });

  if (searchCache.size > 2_000) searchCache.clear();
  searchCache.set(cacheKey, { value: candidates, expiresAt: now + SEARCH_CACHE_TTL_MS });
  return candidates.slice(0, limit);
}
