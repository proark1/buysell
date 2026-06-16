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
}

export interface WithdrawEbayOfferOptions {
  offerId: string;
  accessToken: string;
  sandbox?: boolean;
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
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
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

export async function withdrawEbayOffer(options: WithdrawEbayOfferOptions): Promise<unknown> {
  const host = options.sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const response = await fetch(`https://${host}/sell/inventory/v1/offer/${encodeURIComponent(options.offerId)}/withdraw`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.accessToken}` }
  });

  if (!response.ok) throw new Error(`eBay offer withdraw failed with status ${response.status}`);
  if (response.status === 204) return { offerId: options.offerId, withdrawn: true };
  return await response.json();
}
