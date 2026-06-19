import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { assertEqual } from '../services/testHelpers.js';

type InjectResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type TestApp = Awaited<ReturnType<typeof buildApp>> & {
  inject(input: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<InjectResponse>;
  close(): Promise<void>;
};

const originalSecret = env.LOCAL_AGENT_SHARED_SECRET;
env.LOCAL_AGENT_SHARED_SECRET = 'dashboard-test-secret';
const app = await buildApp() as TestApp;

try {
  const loginPage = await app.inject({ method: 'GET', url: '/' });
  assertEqual(loginPage.statusCode, 200, 'dashboard login route status');
  assertEqual(loginPage.headers['content-type']?.toString().includes('text/html'), true, 'dashboard route content type');
  assertEqual(loginPage.body.includes('Buysell Control Center'), true, 'login page includes product name');
  assertEqual(loginPage.body.includes('Sign In'), true, 'unauthenticated dashboard shows login');

  const login = await app.inject({
    method: 'POST',
    url: '/dashboard/login',
    payload: { secret: 'dashboard-test-secret' }
  });
  assertEqual(login.statusCode, 200, 'dashboard login accepts configured secret');
  const setCookie = login.headers['set-cookie'];
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie]).filter((value): value is string => Boolean(value));
  const cookieHeader = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  const csrfCookie = cookies.find((cookie) => cookie.startsWith('buysell_dashboard_csrf='));
  const csrfToken = csrfCookie?.split(';')[0]?.split('=')[1] ?? '';
  assertEqual(Boolean(cookieHeader), true, 'dashboard login sets cookies');
  assertEqual(Boolean(csrfToken), true, 'dashboard login sets csrf cookie');

  const dashboard = await app.inject({ method: 'GET', url: '/', headers: { cookie: cookieHeader } });
  assertEqual(dashboard.body.includes('Setup Checklist'), true, 'dashboard includes setup checklist');
  assertEqual(dashboard.body.includes('/api/dashboard/discovery-candidates'), true, 'dashboard includes lazy discovery endpoint');
  assertEqual(dashboard.body.includes('Comparison Results'), true, 'dashboard discover defaults to comparison results tab');
  assertEqual(dashboard.body.includes('Latest Comparison Results'), true, 'dashboard discover leads with latest comparison results');

  const credentials = await app.inject({ method: 'GET', url: '/api/credentials', headers: { cookie: cookieHeader } });
  assertEqual(credentials.statusCode, 200, 'dashboard session can read protected routes');

  const missingCsrf = await app.inject({
    method: 'PUT',
    url: '/api/credentials/SERPAPI_API_KEY',
    headers: { cookie: cookieHeader },
    payload: { value: '' }
  });
  assertEqual(missingCsrf.statusCode, 401, 'dashboard mutation without CSRF is rejected');

  const invalidSecret = await app.inject({
    method: 'POST',
    url: '/dashboard/login',
    payload: { secret: 'wrong-secret' }
  });
  assertEqual(invalidSecret.statusCode, 401, 'dashboard login rejects invalid secret');

  env.LOCAL_AGENT_SHARED_SECRET = undefined;
  const protectedResponse = await app.inject({ method: 'GET', url: '/api/dashboard/discovery-candidates' });
  assertEqual(protectedResponse.statusCode, 503, 'lazy discovery endpoint requires configured auth secret');

  console.log('dashboard route smoke test passed');
} finally {
  env.LOCAL_AGENT_SHARED_SECRET = originalSecret;
  await app.close();
}
