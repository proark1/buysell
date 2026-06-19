import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { withSchedulerLock } from './schedulerLocks.js';
import { runEbayOrderSync } from './ebayOrderSync.js';

const minutesToMs = (minutes: number): number => Math.max(1, minutes) * 60_000;
const schedulerRetryMinutes = 1;
const syncTimeoutMinutes = 5;
const syncLimit = 50;

export async function runLockedEbayOrderSync(lookbackHours: number): Promise<unknown> {
  const locked = await withSchedulerLock(prisma, {
    name: 'ebay-order-sync',
    ttlMs: minutesToMs(syncTimeoutMinutes + 1),
    metadata: { job: 'ebay-order-sync' }
  }, () => runEbayOrderSync(prisma, { lookbackHours, limit: syncLimit }));

  return locked.acquired
    ? locked.result
    : { skipped: true, reason: 'eBay order sync is already running on another worker.' };
}

export function startEbayOrderSyncScheduler(app: FastifyInstance): void {
  const scheduleNext = async (): Promise<void> => {
    let enabled = false;
    let intervalMinutes = 15;
    let lookbackHours = 48;
    try {
      const config = await getActiveRuleConfig(prisma);
      enabled = config.ebayOrderSyncEnabled;
      intervalMinutes = config.ebayOrderSyncIntervalMinutes;
      lookbackHours = config.ebayOrderSyncLookbackHours;
    } catch (error) {
      app.log.error({ error }, 'eBay order sync scheduler could not load config; retrying soon');
      setTimeout(() => {
        scheduleNext().catch((scheduleError: unknown) => app.log.error({ error: scheduleError }, 'eBay order sync scheduling failed'));
      }, minutesToMs(schedulerRetryMinutes));
      return;
    }

    const startedAt = Date.now();
    setTimeout(() => {
      const work = enabled
        ? runLockedEbayOrderSync(lookbackHours)
        : Promise.resolve({ skipped: true, reason: 'eBay order sync is disabled.' });
      work
        .then((result) => { if (enabled) app.log.info({ result }, 'eBay order sync completed'); })
        .catch((error: unknown) => app.log.error({ error }, 'eBay order sync failed'))
        .finally(() => {
          // Re-arm accounting for run time so the interval doesn't drift later each cycle.
          const elapsed = Date.now() - startedAt;
          setTimeout(() => {
            scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay order sync scheduling failed'));
          }, Math.max(0, minutesToMs(intervalMinutes) - elapsed));
        });
    }, minutesToMs(intervalMinutes));
  };

  scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay order sync scheduler failed to start'));
}
