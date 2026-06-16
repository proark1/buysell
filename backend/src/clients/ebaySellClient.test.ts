import { prepareEbayListingDraft, withdrawEbayOffer } from './ebaySellClient.js';
import { assertEqual } from '../services/testHelpers.js';

const draft = prepareEbayListingDraft({
  sku: 'sku-1',
  title: 'A'.repeat(90),
  description: 'description',
  price: 12.345,
  quantity: 1,
  marketplaceId: 'EBAY_US'
});

assertEqual(draft.title.length, 80, 'draft title length');
assertEqual(draft.price, 12.35, 'draft rounded price');
assertEqual(draft.status, 'PREPARED', 'draft status');

let capturedUrl = '';
let capturedMethod = '';
const originalFetch = globalThis.fetch;

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(url);
  capturedMethod = init?.method ?? 'GET';
  return {
    ok: true,
    status: 204,
    json: async () => ({})
  } as Response;
}) as typeof fetch;

const withdrawResult = await withdrawEbayOffer({ offerId: 'offer/123', accessToken: 'token', sandbox: true }) as { withdrawn: boolean };

assertEqual(capturedUrl, 'https://api.sandbox.ebay.com/sell/inventory/v1/offer/offer%2F123/withdraw', 'withdraw URL');
assertEqual(capturedMethod, 'POST', 'withdraw method');
assertEqual(withdrawResult.withdrawn, true, 'withdraw result');

globalThis.fetch = originalFetch;

console.log('ebaySellClient unit test passed');
