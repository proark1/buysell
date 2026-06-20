import { z } from 'zod';
import type { AmazonMatchInput } from '../domain/products.js';
import { postgresInt } from '../utils/postgres.js';
import { fetchWithRetry } from './httpClient.js';

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

const keepaTokenStatusSchema = z.object({
  tokensLeft: z.number(),
  refillIn: z.number().optional(),
  refillRate: z.number().optional(),
  tokenFlowReduction: z.number().optional()
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
  domainId?: number | null;
}

const KEEPA_SEARCH_PAGE_SIZE = 10;
const KEEPA_PRODUCT_SEARCH_MAX_RESULTS = 50;

const keepaCentsToMoney = (value?: number | null): number | undefined => {
  if (value === undefined || value === null || value < 0) return undefined;
  return Math.round(value) / 100;
};

const nullableText = (value?: string | null): string | undefined => value ?? undefined;

const amazonDomainByKeepaId: Record<number, string> = {
  1: 'amazon.com',
  2: 'amazon.co.uk',
  3: 'amazon.de',
  4: 'amazon.fr',
  5: 'amazon.co.jp',
  6: 'amazon.ca',
  8: 'amazon.it',
  9: 'amazon.es',
  10: 'amazon.in',
  11: 'amazon.com.mx'
};

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

export interface KeepaProductOptions {
  asin: string;
  apiKey: string;
  domain?: number;
}

export interface KeepaTokenStatus {
  tokensLeft: number;
  refillIn?: number;
  refillRate?: number;
  retryAfterSeconds?: number;
  tokenFlowReduction?: number;
}

function keepaProductToAmazonMatch(product: KeepaProduct, fallbackDomainId: number): AmazonMatchInput {
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
    url: `https://www.${amazonDomainByKeepaId[product.domainId ?? fallbackDomainId] ?? 'amazon.com'}/dp/${product.asin}`,
    brand: nullableText(product.brand),
    model: nullableText(product.model),
    upc: product.upcList?.[0],
    currentPrice,
    buyBoxPrice,
    avg90Price,
    priceDropPercent,
    availabilityStatus: product.availabilityAmazon === 0 ? 'IN_STOCK' : 'UNKNOWN',
    salesRank: postgresInt(product.salesRankReference),
    rating: product.rating ?? undefined,
    reviewCount: postgresInt(keepaReviewCount(product)),
    categoryTree,
    rootCategory: categoryTree[0],
    matchConfidence: 0,
    raw: product
  };
}

export function keepaDomainIdFromAmazonUrl(url: string | undefined): number | undefined {
  if (!url) return undefined;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
  const entry = Object.entries(amazonDomainByKeepaId).find(([, domain]) => domain === host);
  return entry ? Number(entry[0]) : undefined;
}

export async function getKeepaTokenStatus(apiKey: string): Promise<KeepaTokenStatus> {
  const params = new URLSearchParams({ key: apiKey });
  const response = await fetchWithRetry(`https://api.keepa.com/token?${params.toString()}`);
  if (!response.ok) {
    throw new KeepaApiError(response.status, await response.text());
  }

  const payload = keepaTokenStatusSchema.parse(await response.json());
  return {
    tokensLeft: payload.tokensLeft,
    refillIn: payload.refillIn,
    refillRate: payload.refillRate,
    retryAfterSeconds: payload.refillIn && payload.refillIn > 0 ? Math.ceil(payload.refillIn / 1000) : undefined,
    tokenFlowReduction: payload.tokenFlowReduction
  };
}

export async function findAmazonMatches(options: KeepaSearchOptions): Promise<AmazonMatchInput[]> {
  const limit = Math.min(Math.max(options.limit ?? KEEPA_SEARCH_PAGE_SIZE, 1), KEEPA_PRODUCT_SEARCH_MAX_RESULTS);
  const pageCount = Math.min(Math.ceil(limit / KEEPA_SEARCH_PAGE_SIZE), 10);
  const products: KeepaProduct[] = [];
  const domain = options.domain ?? 1;

  for (let page = 0; page < pageCount && products.length < limit; page += 1) {
    const params = new URLSearchParams({
      key: options.apiKey,
      domain: String(domain),
      type: 'product',
      term: options.query,
      page: String(page),
      stats: '90',
      history: '0',
      update: '24',
      'asins-only': '0'
    });

    const response = await fetchWithRetry(`https://api.keepa.com/search?${params.toString()}`);
    if (!response.ok) {
      throw new KeepaApiError(response.status, await response.text());
    }

    const payload = keepaResponseSchema.parse(await response.json());
    const pageProducts = (payload.products ?? []).slice(0, KEEPA_SEARCH_PAGE_SIZE);
    products.push(...pageProducts);
    if (pageProducts.length < KEEPA_SEARCH_PAGE_SIZE) break;
  }

  return products.slice(0, limit).map((product) => keepaProductToAmazonMatch(product, domain));
}

interface CachedProduct {
  value: AmazonMatchInput | undefined;
  expiresAt: number;
}

// Short-TTL cache so repeated single-ASIN lookups within a monitor/sync pass (and across the
// price monitor + buy re-check) don't each spend Keepa tokens for the same product.
const productCache = new Map<string, CachedProduct>();
const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getAmazonProductByAsin(options: KeepaProductOptions): Promise<AmazonMatchInput | undefined> {
  const domain = options.domain ?? 1;
  const cacheKey = `${domain}:${options.asin}`;
  const now = Date.now();
  const cached = productCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const params = new URLSearchParams({
    key: options.apiKey,
    domain: String(domain),
    asin: options.asin,
    stats: '90',
    history: '0',
    update: '24'
  });

  const response = await fetchWithRetry(`https://api.keepa.com/product?${params.toString()}`);
  if (!response.ok) {
    throw new KeepaApiError(response.status, await response.text());
  }

  const payload = keepaResponseSchema.parse(await response.json());
  const product = payload.products?.find((item: KeepaProduct) => item.asin === options.asin) ?? payload.products?.[0];
  const value = product ? keepaProductToAmazonMatch(product, domain) : undefined;
  if (productCache.size > 5_000) productCache.clear();
  productCache.set(cacheKey, { value, expiresAt: now + PRODUCT_CACHE_TTL_MS });
  return value;
}

export interface KeepaProductsBatchOptions {
  asins: string[];
  apiKey: string;
  domain?: number;
}

const KEEPA_PRODUCT_BATCH_SIZE = 100;

/**
 * Fetch many ASINs in batched /product calls (Keepa accepts up to 100 ASINs per request)
 * and prime the per-ASIN cache, so callers that then call getAmazonProductByAsin per item
 * hit the cache instead of spending one token-metered call each. Returns a map by ASIN.
 */
export async function getAmazonProductsByAsins(options: KeepaProductsBatchOptions): Promise<Map<string, AmazonMatchInput>> {
  const domain = options.domain ?? 1;
  const unique = [...new Set(options.asins.filter((asin) => asin && asin.trim()))];
  const out = new Map<string, AmazonMatchInput>();
  const now = Date.now();

  for (let i = 0; i < unique.length; i += KEEPA_PRODUCT_BATCH_SIZE) {
    const chunk = unique.slice(i, i + KEEPA_PRODUCT_BATCH_SIZE);
    const params = new URLSearchParams({ key: options.apiKey, domain: String(domain), asin: chunk.join(','), stats: '90', history: '0', update: '24' });
    const response = await fetchWithRetry(`https://api.keepa.com/product?${params.toString()}`);
    if (!response.ok) throw new KeepaApiError(response.status, await response.text());
    const payload = keepaResponseSchema.parse(await response.json());
    const products = payload.products ?? [];
    for (const asin of chunk) {
      const product = products.find((item: KeepaProduct) => item.asin === asin);
      const value = product ? keepaProductToAmazonMatch(product, domain) : undefined;
      if (productCache.size > 5_000) productCache.clear();
      productCache.set(`${domain}:${asin}`, { value, expiresAt: now + PRODUCT_CACHE_TTL_MS });
      if (value) out.set(asin, value);
    }
  }
  return out;
}
