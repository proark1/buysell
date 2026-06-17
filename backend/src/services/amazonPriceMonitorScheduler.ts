import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { runAmazonPriceMonitor } from './amazonPriceMonitor.js';

const minutesToMs = (minutes: number): number => Math.max(1, minutes) * 60_000;
const schedulerRetryMinutes = 1;

export function startAmazonPriceMonitorScheduler(app: FastifyInstance): void {
  const scheduleNext = async (): Promise<void> => {
    let intervalMinutes: number;
    try {
      const config = await getActiveRuleConfig(prisma);
      intervalMinutes = config.amazonPriceCheckIntervalMinutes;
    } catch (error) {
      app.log.error({ error }, 'Amazon price monitor scheduler could not load config; retrying soon');
      setTimeout(() => {
        scheduleNext().catch((scheduleError: unknown) => app.log.error({ error: scheduleError }, 'Amazon price monitor scheduling failed'));
      }, minutesToMs(schedulerRetryMinutes));
      return;
    }

    setTimeout(() => {
      runAmazonPriceMonitor(prisma)
        .then((result) => app.log.info({ result }, 'Amazon price monitor completed'))
        .catch((error: unknown) => app.log.error({ error }, 'Amazon price monitor failed'))
        .finally(() => {
          scheduleNext().catch((error: unknown) => app.log.error({ error }, 'Amazon price monitor scheduling failed'));
        });
    }, minutesToMs(intervalMinutes));
  };

  scheduleNext().catch((error: unknown) => app.log.error({ error }, 'Amazon price monitor scheduler failed to start'));
}
