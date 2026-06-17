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

export async function getEbayAccessToken(options: EbayOAuthOptions): Promise<string> {
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
      scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory'
    })
  });

  if (!response.ok) throw new Error(`eBay OAuth refresh failed with status ${response.status}`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error('eBay OAuth response did not include access_token');
  return payload.access_token;
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
      'content-language': 'en-US'
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
      'content-language': 'en-US'
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
          currency: options.marketplaceId === 'EBAY_GB' ? 'GBP' : options.marketplaceId.startsWith('EBAY_DE') ? 'EUR' : 'USD'
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
            currency: options.marketplaceId === 'EBAY_GB' ? 'GBP' : options.marketplaceId.startsWith('EBAY_DE') ? 'EUR' : 'USD'
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
