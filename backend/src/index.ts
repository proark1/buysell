import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { prisma as prismaClient } from './db/prisma.js';
import { startAmazonPriceMonitorScheduler } from './services/amazonPriceMonitorScheduler.js';
import { startEbayAmazonComparisonScheduler, startEbayDiscoveryScheduler } from './services/ebayDiscoveryScheduler.js';
import { startEbayOrderSyncScheduler } from './services/ebayOrderSyncScheduler.js';
import { sweepStaleAutomationRuns } from './services/automation.js';
import { deleteExpiredDashboardSessions } from './security/dashboardSession.js';

async function main(): Promise<void> {
  const app = await buildApp();

  // Recover automation runs orphaned by a prior crash so their actions aren't stuck.
  sweepStaleAutomationRuns(prismaClient)
    .then((count) => { if (count > 0) app.log.info({ count }, 'Swept stale automation runs on startup'); })
    .catch((error: unknown) => app.log.error({ error }, 'Stale automation-run sweep failed'));

  // Bound DashboardSession growth by clearing expired rows.
  deleteExpiredDashboardSessions(prismaClient)
    .then((count) => { if (count > 0) app.log.info({ count }, 'Deleted expired dashboard sessions on startup'); })
    .catch((error: unknown) => app.log.error({ error }, 'Dashboard session cleanup failed'));

  startAmazonPriceMonitorScheduler(app);
  startEbayDiscoveryScheduler(app);
  startEbayAmazonComparisonScheduler(app);
  startEbayOrderSyncScheduler(app);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Received shutdown signal; draining and disconnecting.');
    try {
      await (app as unknown as { close(): Promise<void> }).close();
      await (prisma as unknown as { $disconnect(): Promise<void> }).$disconnect();
    } catch (error) {
      app.log.error({ error }, 'Error during graceful shutdown.');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  // Log instead of crashing silently so background scheduler/automation faults are visible.
  process.on('unhandledRejection', (reason) => { app.log.error({ reason }, 'Unhandled promise rejection.'); });
  process.on('uncaughtException', (error) => { app.log.error({ error }, 'Uncaught exception.'); });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
