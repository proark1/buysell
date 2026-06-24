import { getAmazonSpApiAccessToken, getMyFeesEstimateForAsin } from './amazonSpApiClient.js';
import { assertEqual } from '../services/testHelpers.js';

const originalFetch = globalThis.fetch;
let capturedUrl = '';
let capturedMethod = '';
let capturedBody = '';

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(url);
  capturedMethod = init?.method ?? 'GET';
  capturedBody = String(init?.body ?? '');
  return new Response(JSON.stringify({ access_token: 'lwa-token', expires_in: 3600 }), { status: 200 });
}) as typeof fetch;

const accessToken = await getAmazonSpApiAccessToken({
  clientId: 'client',
  clientSecret: 'secret',
  refreshToken: 'refresh'
});
assertEqual(accessToken, 'lwa-token', 'LWA access token');
assertEqual(capturedUrl, 'https://api.amazon.com/auth/o2/token', 'LWA token URL');
assertEqual(capturedMethod, 'POST', 'LWA token method');
if (!capturedBody.includes('grant_type=refresh_token')) throw new Error('LWA token body should use refresh_token grant');

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  capturedUrl = String(url);
  capturedMethod = init?.method ?? 'GET';
  capturedBody = String(init?.body ?? '');
  return new Response(JSON.stringify({
    payload: {
      FeesEstimateResult: {
        Status: 'Success',
        Identifier: 'estimate-1',
        FeesEstimate: {
          TotalFeesEstimate: { Amount: 4.56, CurrencyCode: 'EUR' },
          FeeDetailList: [
            { FeeType: 'ReferralFee', FeeAmount: { Amount: 1.23, CurrencyCode: 'EUR' } }
          ]
        }
      }
    }
  }), { status: 200 });
}) as typeof fetch;

const estimate = await getMyFeesEstimateForAsin({
  asin: 'B000000000',
  accessToken: 'lwa-token',
  endpoint: 'https://sellingpartnerapi-eu.amazon.com/',
  marketplaceId: 'A1PA6795UKMFR9',
  listingPrice: 19.995,
  shippingPrice: 0,
  currencyCode: 'EUR',
  identifier: 'estimate-1'
});

assertEqual(capturedMethod, 'POST', 'fees estimate method');
assertEqual(capturedUrl, 'https://sellingpartnerapi-eu.amazon.com/products/fees/v0/items/B000000000/feesEstimate', 'fees estimate URL');
if (!capturedBody.includes('"MarketplaceId":"A1PA6795UKMFR9"')) throw new Error('fees body should include marketplace id');
if (!capturedBody.includes('"Amount":20')) throw new Error('fees body should round listing price');
assertEqual(estimate.totalFeesEstimate, 4.56, 'total fees estimate');
assertEqual(estimate.currencyCode, 'EUR', 'fees currency');
assertEqual(estimate.detail?.[0]?.feeType, 'ReferralFee', 'fee detail type');

globalThis.fetch = originalFetch;

console.log('amazonSpApiClient unit test passed');
