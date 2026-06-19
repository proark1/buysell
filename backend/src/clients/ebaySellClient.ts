export interface EbayListingDraftInput {
  sku: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  marketplaceId: string;
}

export interface EbayListingDraftResult {
  sku: string;
  marketplaceId: string;
  status: 'PREPARED';
  title: string;
  price: number;
  quantity: number;
}

export interface EbayOAuthOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sandbox?: boolean;
  scopes?: string[];
}

export interface WithdrawEbayOfferOptions {
  offerId: string;
  accessToken: string;
  sandbox?: boolean;
}

export interface EbayInventoryItemOptions {
  sku: string;
  accessToken: string;
  sandbox?: boolean;
  marketplaceId?: string;
  title: string;
  description: string;
  quantity: number;
  condition?: string;
  brand?: string;
  imageUrls?: string[];
  aspects?: Record<string, string[]>;
}

export interface EbayOfferOptions {
  sku: string;
  accessToken: string;
  sandbox?: boolean;
  marketplaceId: string;
  price: number;
  quantity: number;
  categoryId: string;
  merchantLocationKey: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  listingDescription: string;
}

export interface PublishEbayOfferOptions {
  offerId: string;
  accessToken: string;
  sandbox?: boolean;
}

export interface UpdateEbayOfferPriceQuantityOptions {
  sku: string;
  offerId: string;
  accessToken: string;
  sandbox?: boolean;
  marketplaceId: string;
  price: number;
  quantity?: number;
}

export interface EbayBrowseSearchOptions {
  accessToken: string;
  sandbox?: boolean;
  marketplaceId: string;
  query: string;
  categoryIds?: string[];
  gtin?: string;
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  conditions?: string[];
  buyingOptions?: Array<'FIXED_PRICE' | 'AUCTION' | 'BEST_OFFER'>;
}

export interface EbayBrowseItemSummary {
  itemId: string;
  title: string;
  itemWebUrl?: string;
  price?: {
    value: string;
    currency: string;
  };
  itemLocation?: unknown;
  condition?: string;
  buyingOptions?: string[];
  categories?: unknown[];
  raw: unknown;
}

export interface EbayCategorySuggestionOptions {
  accessToken: string;
  sandbox?: boolean;
  marketplaceId: string;
  query: string;
  categoryTreeId?: string;
}

export interface EbayOfferListingFeesOptions {
  offerId: string;
  accessToken: string;
  sandbox?: boolean;
}

const marketplaceConfig: Record<string, { currency: string; contentLanguage: string; categoryTreeId: string }> = {
  EBAY_US: { currency: 'USD', contentLanguage: 'en-US', categoryTreeId: '0' },
  EBAY_CA: { currency: 'CAD', contentLanguage: 'en-CA', categoryTreeId: '2' },
  EBAY_GB: { currency: 'GBP', contentLanguage: 'en-GB', categoryTreeId: '3' },
  EBAY_DE: { currency: 'EUR', contentLanguage: 'de-DE', categoryTreeId: '77' },
  EBAY_FR: { currency: 'EUR', contentLanguage: 'fr-FR', categoryTreeId: '71' },
  EBAY_IT: { currency: 'EUR', contentLanguage: 'it-IT', categoryTreeId: '101' },
  EBAY_ES: { currency: 'EUR', contentLanguage: 'es-ES', categoryTreeId: '186' }
};

export function currencyForEbayMarketplace(marketplaceId: string): string {
  return marketplaceConfig[marketplaceId]?.currency ?? 'USD';
}

export function contentLanguageForEbayMarketplace(marketplaceId: string): string {
  return marketplaceConfig[marketplaceId]?.contentLanguage ?? 'en-US';
}

function categoryTreeIdForMarketplace(marketplaceId: string): string {
  return marketplaceConfig[marketplaceId]?.categoryTreeId ?? marketplaceConfig.EBAY_US.categoryTreeId;
}

export function prepareEbayListingDraft(input: EbayListingDraftInput): EbayListingDraftResult {
  return {
    sku: input.sku,
    marketplaceId: input.marketplaceId,
    status: 'PREPARED',
    title: input.title.slice(0, 80),
    price: Math.round(input.price * 100) / 100,
    quantity: input.quantity
  };
}

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

// Cache access tokens per (env, clientId, scopes) and coalesce concurrent refreshes so
// every marketplace action doesn't burn an OAuth refresh call (and refresh quota).
const accessTokenCache = new Map<string, CachedAccessToken>();
const accessTokenInFlight = new Map<string, Promise<string>>();
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

async function requestEbayAccessToken(options: EbayOAuthOptions, scopes: string[]): Promise<{ token: string; ttlMs: number }> {
  const credentials = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64');
  const host = options.sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const response = await fetch(`https://${host}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: options.refreshToken,
      scope: scopes.join(' ')
    })
  });

  if (!response.ok) {
    // Surface the OAuth error body (e.g. invalid_grant) so re-auth issues are diagnosable.
    const body = await response.text().catch(() => '');
    throw new Error(`eBay OAuth refresh failed with status ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('eBay OAuth response did not include access_token');
  const ttlMs = (typeof payload.expires_in === 'number' && payload.expires_in > 0 ? payload.expires_in : 7200) * 1000;
  return { token: payload.access_token, ttlMs };
}

export async function getEbayAccessToken(options: EbayOAuthOptions): Promise<string> {
  const scopes = options.scopes ?? ['https://api.ebay.com/oauth/api_scope/sell.inventory'];
  const key = `${options.sandbox ? 'sandbox' : 'prod'}:${options.clientId}:${scopes.join(' ')}`;
  const now = Date.now();

  const cached = accessTokenCache.get(key);
  if (cached && cached.expiresAt > now + ACCESS_TOKEN_REFRESH_SKEW_MS) return cached.token;

  const inFlight = accessTokenInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const { token, ttlMs } = await requestEbayAccessToken(options, scopes);
      accessTokenCache.set(key, { token, expiresAt: Date.now() + ttlMs });
      return token;
    } finally {
      accessTokenInFlight.delete(key);
    }
  })();
  accessTokenInFlight.set(key, promise);
  return promise;
}

const ebayApiHost = (sandbox?: boolean): string => sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';

async function parseEbayResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function createOrReplaceEbayInventoryItem(options: EbayInventoryItemOptions): Promise<unknown> {
  const response = await fetch(`https://${ebayApiHost(options.sandbox)}/sell/inventory/v1/inventory_item/${encodeURIComponent(options.sku)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json',
      'content-language': contentLanguageForEbayMarketplace(options.marketplaceId ?? 'EBAY_US')
    },
    body: JSON.stringify({
      availability: {
        shipToLocationAvailability: {
          quantity: options.quantity
        }
      },
      condition: options.condition ?? 'NEW',
      product: {
        title: options.title.slice(0, 80),
        description: options.description,
        brand: options.brand,
        imageUrls: options.imageUrls,
        aspects: options.aspects
      }
    })
  });

  if (!response.ok) throw new Error(`eBay inventory item upsert failed with status ${response.status}: ${JSON.stringify(await parseEbayResponse(response))}`);
  return parseEbayResponse(response);
}

export async function createEbayOffer(options: EbayOfferOptions): Promise<{ offerId: string; raw: unknown }> {
  const response = await fetch(`https://${ebayApiHost(options.sandbox)}/sell/inventory/v1/offer`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json',
      'content-language': contentLanguageForEbayMarketplace(options.marketplaceId)
    },
    body: JSON.stringify({
      sku: options.sku,
      marketplaceId: options.marketplaceId,
      format: 'FIXED_PRICE',
      availableQuantity: options.quantity,
      categoryId: options.categoryId,
      merchantLocationKey: options.merchantLocationKey,
      listingDescription: options.listingDescription,
      listingPolicies: {
        fulfillmentPolicyId: options.fulfillmentPolicyId,
        paymentPolicyId: options.paymentPolicyId,
        returnPolicyId: options.returnPolicyId
      },
      pricingSummary: {
        price: {
          value: options.price.toFixed(2),
          currency: currencyForEbayMarketplace(options.marketplaceId)
        }
      }
    })
  });

  const raw = await parseEbayResponse(response);
  if (!response.ok) throw new Error(`eBay offer create failed with status ${response.status}: ${JSON.stringify(raw)}`);
  const offerId = raw && typeof raw === 'object' && 'offerId' in raw && typeof raw.offerId === 'string' ? raw.offerId : undefined;
  if (!offerId) throw new Error('eBay offer create response did not include offerId');
  return { offerId, raw };
}

export async function publishEbayOffer(options: PublishEbayOfferOptions): Promise<unknown> {
  const response = await fetch(`https://${ebayApiHost(options.sandbox)}/sell/inventory/v1/offer/${encodeURIComponent(options.offerId)}/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.accessToken}` }
  });

  const raw = await parseEbayResponse(response);
  if (!response.ok) throw new Error(`eBay offer publish failed with status ${response.status}: ${JSON.stringify(raw)}`);
  return raw;
}

export async function updateEbayOfferPriceQuantity(options: UpdateEbayOfferPriceQuantityOptions): Promise<unknown> {
  const response = await fetch(`https://${ebayApiHost(options.sandbox)}/sell/inventory/v1/bulk_update_price_quantity`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      requests: [{
        sku: options.sku,
        offers: [{
          offerId: options.offerId,
          price: {
            value: options.price.toFixed(2),
            currency: currencyForEbayMarketplace(options.marketplaceId)
          },
          availableQuantity: options.quantity
        }]
      }]
    })
  });

  const raw = await parseEbayResponse(response);
  if (!response.ok) throw new Error(`eBay offer price/quantity update failed with status ${response.status}: ${JSON.stringify(raw)}`);
  return raw;
}

export async function withdrawEbayOffer(options: WithdrawEbayOfferOptions): Promise<unknown> {
  const host = ebayApiHost(options.sandbox);
  const response = await fetch(`https://${host}/sell/inventory/v1/offer/${encodeURIComponent(options.offerId)}/withdraw`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.accessToken}` }
  });

  if (!response.ok) throw new Error(`eBay offer withdraw failed with status ${response.status}`);
  if (response.status === 204) return { offerId: options.offerId, withdrawn: true };
  return await response.json();
}

function browseFilter(options: EbayBrowseSearchOptions): string | undefined {
  const filters: string[] = [];
  if (options.minPrice !== undefined || options.maxPrice !== undefined) {
    const min = options.minPrice?.toFixed(2) ?? '';
    const max = options.maxPrice?.toFixed(2) ?? '';
    filters.push(`price:[${min}..${max}]`);
    filters.push(`priceCurrency:${currencyForEbayMarketplace(options.marketplaceId)}`);
  }
  if (options.conditions?.length) filters.push(`conditions:{${options.conditions.join('|')}}`);
  if (options.buyingOptions?.length) filters.push(`buyingOptions:{${options.buyingOptions.join('|')}}`);
  return filters.length ? filters.join(',') : undefined;
}

export async function searchEbayBrowseItems(options: EbayBrowseSearchOptions): Promise<EbayBrowseItemSummary[]> {
  const params = new URLSearchParams({
    q: options.query,
    limit: String(Math.min(Math.max(options.limit ?? 20, 1), 200))
  });
  if (options.categoryIds?.length) params.set('category_ids', options.categoryIds.join(','));
  if (options.gtin) params.set('gtin', options.gtin);
  const filter = browseFilter(options);
  if (filter) params.set('filter', filter);

  const response = await fetch(`https://${ebayApiHost(options.sandbox)}/buy/browse/v1/item_summary/search?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'x-ebay-c-marketplace-id': options.marketplaceId
    }
  });
  const raw = await parseEbayResponse(response);
  if (!response.ok) throw new Error(`eBay Browse search failed with status ${response.status}: ${JSON.stringify(raw)}`);
  const itemSummaries = raw && typeof raw === 'object' && 'itemSummaries' in raw && Array.isArray(raw.itemSummaries)
    ? raw.itemSummaries
    : [];
  return itemSummaries.map((item) => {
    const record = item as Record<string, unknown>;
    const price = record.price && typeof record.price === 'object' && !Array.isArray(record.price)
      ? record.price as EbayBrowseItemSummary['price']
      : undefined;
    return {
      itemId: String(record.itemId ?? ''),
      title: String(record.title ?? ''),
      itemWebUrl: typeof record.itemWebUrl === 'string' ? record.itemWebUrl : undefined,
      price,
      itemLocation: record.itemLocation,
      condition: typeof record.condition === 'string' ? record.condition : undefined,
      buyingOptions: Array.isArray(record.buyingOptions) ? record.buyingOptions.filter((value): value is string => typeof value === 'string') : undefined,
      categories: Array.isArray(record.categories) ? record.categories : undefined,
      raw: item
    };
  }).filter((item) => item.itemId && item.title);
}

export async function getEbayCategorySuggestions(options: EbayCategorySuggestionOptions): Promise<unknown> {
  const categoryTreeId = options.categoryTreeId ?? categoryTreeIdForMarketplace(options.marketplaceId);
  const params = new URLSearchParams({ q: options.query });
  const response = await fetch(`https://${ebayApiHost(options.sandbox)}/commerce/taxonomy/v1/category_tree/${encodeURIComponent(categoryTreeId)}/get_category_suggestions?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${options.accessToken}`,
      'x-ebay-c-marketplace-id': options.marketplaceId
    }
  });
  const raw = await parseEbayResponse(response);
  if (!response.ok) throw new Error(`eBay category suggestions failed with status ${response.status}: ${JSON.stringify(raw)}`);
  return raw;
}

export async function getEbayOfferListingFees(options: EbayOfferListingFeesOptions): Promise<unknown> {
  const response = await fetch(`https://${ebayApiHost(options.sandbox)}/sell/inventory/v1/offer/${encodeURIComponent(options.offerId)}/get_listing_fees`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.accessToken}` }
  });
  const raw = await parseEbayResponse(response);
  if (!response.ok) throw new Error(`eBay listing fees failed with status ${response.status}: ${JSON.stringify(raw)}`);
  return raw;
}
