import { findAmazonMatches, getKeepaTokenStatus } from './keepaClient.js';
import { assertEqual } from '../services/testHelpers.js';

const originalFetch = globalThis.fetch;
let capturedUrl = '';

globalThis.fetch = (async (input: string | URL | Request) => {
  capturedUrl = String(input);
  return new Response(JSON.stringify({
    products: [
      {
        asin: 'B000TEST',
        title: 'Test barcode scanner',
        model: null,
        upcList: null,
        stats: {
          current: [-1, 1499],
          buyBoxPrice: 1299,
          avg90: [-1, 1999]
        },
        reviews: {
          ratingCount: [12, 200, 13, 318],
          reviewCount: null
        },
        csv: null,
        availabilityAmazon: 0,
        salesRankReference: 12345
      }
    ]
  }), { status: 200 });
}) as typeof fetch;

try {
  const matches = await findAmazonMatches({
    query: 'barcode scanner',
    apiKey: 'test-key',
    limit: 1
  });
  const url = new URL(capturedUrl);

  assertEqual(url.pathname, '/search', 'Keepa search path');
  assertEqual(url.searchParams.get('type'), 'product', 'Keepa product search type');
  assertEqual(url.searchParams.get('term'), 'barcode scanner', 'Keepa search term');
  assertEqual(url.searchParams.get('page'), '0', 'Keepa search page');
  assertEqual(url.searchParams.get('stats'), '90', 'Keepa stats window');
  assertEqual(url.searchParams.get('history'), '0', 'Keepa history flag');
  assertEqual(url.searchParams.get('update'), '24', 'Keepa discovery refresh window');
  assertEqual(url.searchParams.get('asins-only'), '0', 'Keepa full product flag');
  assertEqual(url.searchParams.has('offers'), false, 'Keepa search must not include offers');
  assertEqual(matches[0]?.asin, 'B000TEST', 'Keepa parsed ASIN');
  assertEqual(matches[0]?.buyBoxPrice, 12.99, 'Keepa parsed Buy Box price');
  assertEqual(matches[0]?.reviewCount, 318, 'Keepa parsed review object count');
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = (async (input: string | URL | Request) => {
  capturedUrl = String(input);
  return new Response(JSON.stringify({
    tokensLeft: 7,
    refillIn: 45000,
    refillRate: 5,
    tokenFlowReduction: 0
  }), { status: 200 });
}) as typeof fetch;

try {
  const status = await getKeepaTokenStatus('test-key');
  const url = new URL(capturedUrl);

  assertEqual(url.pathname, '/token', 'Keepa token path');
  assertEqual(url.searchParams.get('key'), 'test-key', 'Keepa token key');
  assertEqual(status.tokensLeft, 7, 'Keepa tokens left');
  assertEqual(status.retryAfterSeconds, 45, 'Keepa retry seconds');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('keepaClient unit test passed');
