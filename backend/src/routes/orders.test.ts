import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { assertEqual } from '../services/testHelpers.js';

type InjectResponse = { statusCode: number; headers: Record<string, string | string[] | undefined>; body: string };
type TestApp = Awaited<ReturnType<typeof buildApp>> & {
  inject(input: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<InjectResponse>;
  close(): Promise<void>;
};

const originalSecret = env.LOCAL_AGENT_SHARED_SECRET;
env.LOCAL_AGENT_SHARED_SECRET = 'orders-test-secret';
const app = await buildApp() as TestApp;

try {
  // Unauthenticated mutation is rejected.
  const noAuth = await app.inject({
    method: 'POST',
    url: '/orders/order-1/amazon-purchase',
    payload: { asin: 'B000TEST', purchasePrice: 10 }
  });
  assertEqual(noAuth.statusCode === 401 || noAuth.statusCode === 503, true, 'amazon-purchase requires auth');

  // Authenticate via the dashboard session (cookie + CSRF), like the dashboard does.
  const login = await app.inject({ method: 'POST', url: '/dashboard/login', payload: { secret: 'orders-test-secret' } });
  assertEqual(login.statusCode, 200, 'login succeeds');
  const setCookie = login.headers['set-cookie'];
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie]).filter((value): value is string => Boolean(value));
  const cookieHeader = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  const csrfToken = cookies.find((cookie) => cookie.startsWith('buysell_dashboard_csrf='))?.split(';')[0]?.split('=')[1] ?? '';
  const authHeaders = { cookie: cookieHeader, 'x-csrf-token': csrfToken };

  // Budget-counting purchase (PURCHASED) without a positive price is rejected before any DB write.
  const missingPrice = await app.inject({
    method: 'POST',
    url: '/orders/order-1/amazon-purchase',
    headers: authHeaders,
    payload: { asin: 'B000TEST', status: 'PURCHASED' }
  });
  assertEqual(missingPrice.statusCode, 400, 'budget-counting purchase without price is rejected');
  assertEqual(missingPrice.body.includes('PURCHASE_PRICE_REQUIRED'), true, 'rejection carries the price-required code');

  // Invalid status enum is rejected by schema validation.
  const badStatus = await app.inject({
    method: 'POST',
    url: '/orders/order-1/amazon-purchase',
    headers: authHeaders,
    payload: { asin: 'B000TEST', purchasePrice: 10, status: 'NONSENSE' }
  });
  assertEqual(badStatus.statusCode, 400, 'unknown purchase status is rejected');

  console.log('orders route unit test passed');
} finally {
  env.LOCAL_AGENT_SHARED_SECRET = originalSecret;
  await app.close();
}
