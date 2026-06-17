import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { getKeepaTokenStatus, KeepaApiError } from '../clients/keepaClient.js';
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
const amazonMatchLimit = 3;

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
  comparisonSkippedReason?: string;
  keepa?: {
    tokensLeft?: number;
    retryAfterSeconds?: number;
    requestedTokens?: number;
  };
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
  let comparisonSkippedReason: string | undefined;
  let keepaSummary: { tokensLeft?: number; retryAfterSeconds?: number; requestedTokens?: number } | undefined;
  const runId = typeof persistedRun === 'object' && persistedRun && 'id' in persistedRun ? String(persistedRun.id) : undefined;
  if (!ruleConfig.ebayDiscoveryAutoCompareEnabled) {
    comparisonSkippedReason = 'Amazon comparison is disabled for eBay auto-run; products were saved for later review.';
  } else if (runId && result.candidates.length > 0) {
    const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
    if (!keepaApiKey) {
      comparisonSkippedReason = 'KEEPA_API_KEY is not configured; eBay products were saved without Amazon comparison.';
    } else {
      const requestedTokens = result.candidates.length * amazonMatchLimit;
      try {
        const tokenStatus = await getKeepaTokenStatus(keepaApiKey);
        keepaSummary = {
          tokensLeft: tokenStatus.tokensLeft,
          retryAfterSeconds: tokenStatus.retryAfterSeconds,
          requestedTokens
        };
        const affordableCompareLimit = Math.min(result.candidates.length, Math.floor(Math.max(tokenStatus.tokensLeft, 0) / amazonMatchLimit));
        if (affordableCompareLimit <= 0) {
          comparisonSkippedReason = tokenStatus.retryAfterSeconds
            ? `Keepa has ${tokenStatus.tokensLeft} tokens; retry after about ${tokenStatus.retryAfterSeconds} seconds.`
            : `Keepa has ${tokenStatus.tokensLeft} tokens; Amazon comparison was skipped.`;
        } else {
          const comparison = await compareEbayDiscoveryCandidates({
            db: prisma,
            keepaApiKey,
            serpApiKey,
            ruleConfig,
            runId,
            limit: affordableCompareLimit,
            amazonMatchLimit
          });
          compared = comparison.compared;
          opportunities = comparison.opportunities.length;
          if (affordableCompareLimit < result.candidates.length) {
            comparisonSkippedReason = `Compared ${affordableCompareLimit} products now; ${result.candidates.length - affordableCompareLimit} remain un-compared until Keepa tokens refill.`;
          }
        }
      } catch (error) {
        if (!(error instanceof KeepaApiError)) throw error;
        let retryAfterSeconds: number | undefined;
        let tokensLeft: number | undefined;
        try {
          const payload = JSON.parse(error.body) as Record<string, unknown>;
          tokensLeft = typeof payload.tokensLeft === 'number' ? payload.tokensLeft : undefined;
          retryAfterSeconds = typeof payload.refillIn === 'number' && payload.refillIn > 0 ? Math.ceil(payload.refillIn / 1000) : undefined;
        } catch {
          // Keepa sometimes returns text bodies; keep the generic message below.
        }
        keepaSummary = { tokensLeft, retryAfterSeconds, requestedTokens };
        comparisonSkippedReason = retryAfterSeconds
          ? `Keepa rate limit reached; eBay products were saved and Amazon comparison can retry in about ${retryAfterSeconds} seconds.`
          : 'Keepa rate limit reached; eBay products were saved without Amazon comparison.';
      }
    }
  }

  return {
    enabled: true,
    target,
    scanned: result.candidates.length + result.rejected.length,
    accepted: result.candidates.length,
    rejected: result.rejected.length,
    skippedExisting: result.skippedExisting,
    compared,
    opportunities,
    comparisonSkippedReason,
    keepa: keepaSummary
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
