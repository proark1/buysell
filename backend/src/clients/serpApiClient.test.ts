import { searchEbayCandidates, SerpApiError } from './serpApiClient.js';
import { assertEqual } from '../services/testHelpers.js';

const originalFetch = globalThis.fetch;
let capturedUrl = '';

globalThis.fetch = (async (input: string | URL | Request) => {
  capturedUrl = String(input);
  return new Response(JSON.stringify({
    organic_results: [
      {
        item_id: '123',
        title: 'Wireless barcode scanner',
        link: 'https://www.ebay.com/itm/1',
        price: { raw: '$42.50' },
        shipping: { raw: 'Free shipping' },
        condition: { name: 'Used' },
        category: { name: 'Office Products' },
        category_id: '58058'
      },
      {
        title: { text: 'Thermal label printer' },
        link: { value: 'https://www.ebay.com/itm/2' },
        extracted_price: '31.25',
        shipping: { extracted_price: 4.99 },
        condition: 'Open box'
      },
      {
        title: '',
        price: { raw: '$99.00' }
      }
    ],
    shopping_results: [
      {
        title: 'Compact office scanner',
        price: { amount: 18.75 },
        shipping: '$3.50'
      }
    ]
  }), { status: 200 });
}) as typeof fetch;

try {
  const candidates = await searchEbayCandidates({
    query: 'barcode scanner',
    apiKey: 'test-key',
    ebayDomain: 'ebay.de',
    buyingFormat: 'BIN',
    conditionIds: ['1000'],
    categoryId: '58058',
    minPrice: 20,
    maxPrice: 150,
    preferredLocation: 'Domestic',
    postalCode: '10115',
    limit: 10
  });
  const url = new URL(capturedUrl);

  assertEqual(url.pathname, '/search.json', 'SerpAPI search path');
  assertEqual(url.searchParams.get('engine'), 'ebay', 'SerpAPI eBay engine');
  assertEqual(url.searchParams.get('_nkw'), 'barcode scanner', 'SerpAPI search query');
  assertEqual(url.searchParams.get('ebay_domain'), 'ebay.de', 'SerpAPI eBay domain');
  assertEqual(url.searchParams.get('_ipg'), '25', 'SerpAPI eBay page size');
  assertEqual(url.searchParams.get('show_only'), 'Sold,Complete', 'SerpAPI sold/completed filter');
  assertEqual(url.searchParams.get('LH_Sold'), '1', 'SerpAPI sold filter');
  assertEqual(url.searchParams.get('LH_Complete'), '1', 'SerpAPI completed filter');
  assertEqual(url.searchParams.get('buying_format'), 'BIN', 'SerpAPI buying format filter');
  assertEqual(url.searchParams.get('LH_ItemCondition'), '1000', 'SerpAPI condition filter');
  assertEqual(url.searchParams.get('category_id'), '58058', 'SerpAPI category filter');
  assertEqual(url.searchParams.get('_udlo'), '20', 'SerpAPI min price filter');
  assertEqual(url.searchParams.get('_udhi'), '150', 'SerpAPI max price filter');
  assertEqual(url.searchParams.get('LH_PrefLoc'), '1', 'SerpAPI location filter');
  assertEqual(url.searchParams.get('_stpos'), '10115', 'SerpAPI postal code filter');
  assertEqual(candidates.length, 3, 'SerpAPI parsed candidates');
  assertEqual(candidates[0]?.itemId, '123', 'SerpAPI item id');
  assertEqual(candidates[0]?.soldPrice, 42.5, 'SerpAPI object price');
  assertEqual(candidates[0]?.shippingPrice, 0, 'SerpAPI free shipping');
  assertEqual(candidates[0]?.condition, 'Used', 'SerpAPI object condition');
  assertEqual(candidates[0]?.category, 'Office Products', 'SerpAPI object category');
  assertEqual(candidates[0]?.categoryId, '58058', 'SerpAPI category id');
  assertEqual(candidates[1]?.title, 'Thermal label printer', 'SerpAPI object title');
  assertEqual(candidates[1]?.url, 'https://www.ebay.com/itm/2', 'SerpAPI object link');
  assertEqual(candidates[1]?.soldPrice, 31.25, 'SerpAPI string extracted price');
  assertEqual(candidates[1]?.shippingPrice, 4.99, 'SerpAPI object shipping');
  assertEqual(candidates[2]?.soldPrice, 18.75, 'SerpAPI shopping result object price');
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 200 })) as typeof fetch;

try {
  let threw = false;
  try {
    await searchEbayCandidates({ query: 'scanner', apiKey: 'bad-key' });
  } catch (error) {
    threw = error instanceof SerpApiError;
  }
  assertEqual(threw, true, 'SerpAPI payload error throws typed error');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('serpApiClient unit test passed');
