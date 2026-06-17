import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './routes/health.js';
import { registerProfitRoutes } from './routes/profit.js';
import { registerOpportunityRoutes } from './routes/opportunities.js';
import { registerActionRoutes } from './routes/actions.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDashboardApiRoutes } from './routes/dashboardApi.js';
import { registerCredentialRoutes } from './routes/credentials.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { registerErrorHandler } from './security/errorHandler.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  registerErrorHandler(app);

  await registerDashboardRoutes(app);
  await registerDashboardApiRoutes(app);
  await registerCredentialRoutes(app);
  await registerAutomationRoutes(app);
  await registerHealthRoutes(app);
  await registerProfitRoutes(app);
  await registerOpportunityRoutes(app);
  await registerActionRoutes(app);
  await registerOrderRoutes(app);

  return app;
}
