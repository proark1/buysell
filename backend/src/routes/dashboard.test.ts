import { buildApp } from '../app.js';
import { env } from '../config/env.js';
import { assertEqual } from '../services/testHelpers.js';

type InjectResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type TestApp = Awaited<ReturnType<typeof buildApp>> & {
  inject(input: { method: string; url: string }): Promise<InjectResponse>;
  close(): Promise<void>;
};

const originalSecret = env.LOCAL_AGENT_SHARED_SECRET;
const app = await buildApp() as TestApp;

try {
  const dashboard = await app.inject({ method: 'GET', url: '/' });
  assertEqual(dashboard.statusCode, 200, 'dashboard route status');
  assertEqual(dashboard.headers['content-type']?.toString().includes('text/html'), true, 'dashboard route content type');
  assertEqual(dashboard.body.includes('Setup Checklist'), true, 'dashboard includes setup checklist');
  assertEqual(dashboard.body.includes('/api/dashboard/discovery-candidates'), true, 'dashboard includes lazy discovery endpoint');

  env.LOCAL_AGENT_SHARED_SECRET = undefined;
  const protectedResponse = await app.inject({ method: 'GET', url: '/api/dashboard/discovery-candidates' });
  assertEqual(protectedResponse.statusCode, 503, 'lazy discovery endpoint requires configured auth secret');

  console.log('dashboard route smoke test passed');
} finally {
  env.LOCAL_AGENT_SHARED_SECRET = originalSecret;
  await app.close();
}
