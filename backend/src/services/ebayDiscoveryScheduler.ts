import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { ebayDiscoveryProfiles } from './discoveryPolicy.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { getSecret } from './secrets.js';
import {
  buildEbayDiscoveryCandidates,
  compareEbayDiscoveryCandidates,
  loadExistingEbayDiscoveryKeys,
  persistEbayDiscoveryRun
} from './ebayDiscovery.js';

const minutesToMs = (minutes: number): number => Math.max(1, minutes) * 60_000;
const schedulerRetryMinutes = 1;

interface EbayDiscoverySchedulerTarget {
  profileKey: string;
  categoryKey: string;
  query: string;
}

const schedulerTargets = (): EbayDiscoverySchedulerTarget[] => ebayDiscoveryProfiles.flatMap((profile) => (
  profile.categories.flatMap((category) => (
    category.seedQueries.map((query) => ({
      profileKey: profile.key,
      categoryKey: category.key,
      query
    }))
  ))
)).filter((target) => target.profileKey !== 'custom' && target.query.trim().length > 0);

async function nextSchedulerTarget(): Promise<EbayDiscoverySchedulerTarget | undefined> {
  const targets = schedulerTargets();
  if (!targets.length) return undefined;
  const completedRuns = await prisma.ebayDiscoveryRun.count();
  return targets[completedRuns % targets.length];
}

export async function runScheduledEbayDiscovery(): Promise<{
  enabled: boolean;
  scanned?: number;
  accepted?: number;
  rejected?: number;
  skippedExisting?: number;
  compared?: number;
  opportunities?: number;
  target?: EbayDiscoverySchedulerTarget;
  reason?: string;
}> {
  const ruleConfig = await getActiveRuleConfig(prisma);
  if (!ruleConfig.ebayDiscoveryAutoRunEnabled) {
    return { enabled: false, reason: 'eBay discovery auto-run is disabled.' };
  }

  const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
  if (!serpApiKey) {
    return { enabled: true, reason: 'SERPAPI_API_KEY is not configured.' };
  }

  const target = await nextSchedulerTarget();
  if (!target) {
    return { enabled: true, reason: 'No eBay discovery scheduler targets are configured.' };
  }

  const existingKeys = await loadExistingEbayDiscoveryKeys(prisma);
  const result = await buildEbayDiscoveryCandidates({
    serpApiKey,
    ruleConfig,
    profileKey: target.profileKey,
    categoryKey: target.categoryKey,
    query: target.query,
    limit: ruleConfig.ebayDiscoveryAutoRunLimit,
    mode: 'AUTO',
    safeMode: ruleConfig.safeMode,
    queryBreadth: 'FOCUSED',
    skipExistingProducts: true,
    existingProductFamilyKeys: existingKeys.productFamilyKeys,
    existingEbayItemIds: existingKeys.ebayItemIds
  });

  const persistedRun = await persistEbayDiscoveryRun(prisma, {
    serpApiKey,
    ruleConfig,
    profileKey: target.profileKey,
    categoryKey: target.categoryKey,
    query: target.query,
    limit: ruleConfig.ebayDiscoveryAutoRunLimit,
    mode: 'AUTO',
    safeMode: ruleConfig.safeMode,
    queryBreadth: 'FOCUSED',
    skipExistingProducts: true
  }, result);

  let compared = 0;
  let opportunities = 0;
  const runId = typeof persistedRun === 'object' && persistedRun && 'id' in persistedRun ? String(persistedRun.id) : undefined;
  const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
  if (runId && keepaApiKey && result.candidates.length > 0) {
    const comparison = await compareEbayDiscoveryCandidates({
      db: prisma,
      keepaApiKey,
      serpApiKey,
      ruleConfig,
      runId,
      limit: ruleConfig.ebayDiscoveryAutoRunLimit,
      amazonMatchLimit: 3
    });
    compared = comparison.compared;
    opportunities = comparison.opportunities.length;
  }

  return {
    enabled: true,
    target,
    scanned: result.candidates.length + result.rejected.length,
    accepted: result.candidates.length,
    rejected: result.rejected.length,
    skippedExisting: result.skippedExisting,
    compared,
    opportunities
  };
}

let schedulerRunning = false;

export function startEbayDiscoveryScheduler(app: FastifyInstance): void {
  const scheduleNext = async (): Promise<void> => {
    let intervalMinutes = schedulerRetryMinutes;
    try {
      const config = await getActiveRuleConfig(prisma);
      intervalMinutes = config.ebayDiscoveryAutoRunIntervalMinutes;
    } catch (error) {
      app.log.error({ error }, 'eBay discovery scheduler could not load config; retrying soon');
    }

    setTimeout(() => {
      if (schedulerRunning) {
        app.log.info('eBay discovery scheduler tick skipped because a previous run is still active');
        scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay discovery scheduling failed'));
        return;
      }

      schedulerRunning = true;
      runScheduledEbayDiscovery()
        .then((result) => {
          if (result.enabled) app.log.info({ result }, 'Scheduled eBay discovery completed');
        })
        .catch((error: unknown) => app.log.error({ error }, 'Scheduled eBay discovery failed'))
        .finally(() => {
          schedulerRunning = false;
          scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay discovery scheduling failed'));
        });
    }, minutesToMs(intervalMinutes));
  };

  scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay discovery scheduler failed to start'));
}
