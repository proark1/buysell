import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { registerHealthRoutes } from './routes/health.js';
import { registerProfitRoutes } from './routes/profit.js';
import { registerOpportunityRoutes } from './routes/opportunities.js';
import { registerActionRoutes } from './routes/actions.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDashboardApiRoutes } from './routes/dashboardApi.js';
import { registerCredentialRoutes } from './routes/credentials.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { registerSoldWinnerRoutes } from './routes/soldWinners.js';
import { registerMarketplaceResearchRoutes } from './routes/marketplaceResearch.js';
import { registerErrorHandler } from './security/errorHandler.js';
import { registerRateLimit } from './security/rateLimit.js';
import { env } from './config/env.js';

type HookApp = FastifyInstance & {
  addHook(name: 'onSend', hook: (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void): void;
};

const resolveTrustProxy = (value: string | undefined): boolean | number | string => {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
};

export async function buildApp(): Promise<FastifyInstance> {
  // trustProxy controls how request.ip is derived from X-Forwarded-For. Default false so
  // a spoofed header cannot forge the client IP the rate limiter keys on.
  const app = Fastify({ logger: true, trustProxy: resolveTrustProxy(env.TRUST_PROXY) });
  registerErrorHandler(app);
  registerRateLimit(app);

  // Baseline response-hardening headers. A strict script-src CSP is intentionally
  // deferred until the dashboard's inline handlers are nonce-based.
  (app as HookApp).addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply) => {
    const headerReply = reply as unknown as { header(name: string, value: string): unknown };
    headerReply.header('X-Content-Type-Options', 'nosniff');
    headerReply.header('Referrer-Policy', 'no-referrer');
    headerReply.header('X-Frame-Options', 'DENY');
    headerReply.header('Content-Security-Policy', "frame-ancestors 'none'");
  });

  await registerDashboardRoutes(app);
  await registerDashboardApiRoutes(app);
  await registerCredentialRoutes(app);
  await registerAutomationRoutes(app);
  await registerSoldWinnerRoutes(app);
  await registerMarketplaceResearchRoutes(app);
  await registerHealthRoutes(app);
  await registerProfitRoutes(app);
  await registerOpportunityRoutes(app);
  await registerActionRoutes(app);
  await registerOrderRoutes(app);

  return app;
}
