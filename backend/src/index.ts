import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { startAmazonPriceMonitorScheduler } from './services/amazonPriceMonitorScheduler.js';
import { startEbayAmazonComparisonScheduler, startEbayDiscoveryScheduler } from './services/ebayDiscoveryScheduler.js';
import { startEbayOrderSyncScheduler } from './services/ebayOrderSyncScheduler.js';

async function main(): Promise<void> {
  const app = await buildApp();

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
