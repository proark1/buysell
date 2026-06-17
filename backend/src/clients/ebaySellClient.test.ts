import {
  createEbayOffer,
  createOrReplaceEbayInventoryItem,
  getEbayAccessToken,
  prepareEbayListingDraft,
  publishEbayOffer,
  updateEbayOfferPriceQuantity,
  withdrawEbayOffer
} from './ebaySellClient.js';
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
let capturedBody = '';
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

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(url);
  capturedMethod = init?.method ?? 'GET';
  capturedBody = String(init?.body ?? '');
  return new Response(null, { status: 204 });
}) as typeof fetch;

await createOrReplaceEbayInventoryItem({
  sku: 'sku-1',
  accessToken: 'token',
  sandbox: true,
  title: 'Title',
  description: 'Description',
  quantity: 2,
  brand: 'Brand'
});
assertEqual(capturedUrl, 'https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item/sku-1', 'inventory item URL');
assertEqual(capturedMethod, 'PUT', 'inventory item method');
if (!capturedBody.includes('"quantity":2')) throw new Error('inventory item body should include quantity');

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(url);
  capturedMethod = init?.method ?? 'GET';
  capturedBody = String(init?.body ?? '');
  return new Response(JSON.stringify({ offerId: 'offer-1' }), { status: 200 });
}) as typeof fetch;

const offer = await createEbayOffer({
  sku: 'sku-1',
  accessToken: 'token',
  sandbox: true,
  marketplaceId: 'EBAY_US',
  price: 19.995,
  quantity: 1,
  categoryId: '123',
  merchantLocationKey: 'warehouse',
  fulfillmentPolicyId: 'fulfillment',
  paymentPolicyId: 'payment',
  returnPolicyId: 'return',
  listingDescription: 'Listing'
});
assertEqual(offer.offerId, 'offer-1', 'offer id');
assertEqual(capturedUrl, 'https://api.sandbox.ebay.com/sell/inventory/v1/offer', 'offer URL');
if (!capturedBody.includes('"value":"20.00"')) throw new Error('offer body should round price');

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(url);
  capturedMethod = init?.method ?? 'GET';
  return new Response(JSON.stringify({ listingId: 'listing-1' }), { status: 200 });
}) as typeof fetch;

const publishResult = await publishEbayOffer({ offerId: 'offer/1', accessToken: 'token', sandbox: true }) as { listingId: string };
assertEqual(capturedUrl, 'https://api.sandbox.ebay.com/sell/inventory/v1/offer/offer%2F1/publish', 'publish URL');
assertEqual(capturedMethod, 'POST', 'publish method');
assertEqual(publishResult.listingId, 'listing-1', 'publish listing id');

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(url);
  capturedMethod = init?.method ?? 'GET';
  capturedBody = String(init?.body ?? '');
  return new Response(JSON.stringify({ responses: [{ sku: 'sku-1' }] }), { status: 200 });
}) as typeof fetch;

await updateEbayOfferPriceQuantity({
  sku: 'sku-1',
  offerId: 'offer-1',
  accessToken: 'token',
  sandbox: true,
  marketplaceId: 'EBAY_US',
  price: 23.456,
  quantity: 1
});
assertEqual(capturedUrl, 'https://api.sandbox.ebay.com/sell/inventory/v1/bulk_update_price_quantity', 'bulk price URL');
assertEqual(capturedMethod, 'POST', 'bulk price method');
if (!capturedBody.includes('"value":"23.46"')) throw new Error('bulk price body should round price');
if (!capturedBody.includes('"offers":[{"offerId":"offer-1"')) throw new Error('bulk price body should update by offerId');
if (!capturedBody.includes('"availableQuantity":1')) throw new Error('bulk price body should include available quantity');

globalThis.fetch = (async (url: string | URL | Request) => {
  capturedUrl = String(url);
  return new Response(JSON.stringify({ access_token: 'sandbox-token' }), { status: 200 });
}) as typeof fetch;

const token = await getEbayAccessToken({ clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', sandbox: true });
assertEqual(capturedUrl, 'https://api.sandbox.ebay.com/identity/v1/oauth2/token', 'sandbox OAuth URL');
assertEqual(token, 'sandbox-token', 'sandbox OAuth token');

globalThis.fetch = originalFetch;

console.log('ebaySellClient unit test passed');
