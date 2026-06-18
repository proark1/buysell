import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { getKeepaTokenStatus, KeepaApiError } from '../clients/keepaClient.js';
import { SerpApiError } from '../clients/serpApiClient.js';
import { ebayDiscoveryProfiles } from './discoveryPolicy.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { getSecret } from './secrets.js';
import { withSchedulerLock } from './schedulerLocks.js';
import {
  buildEbayDiscoveryCandidates,
  compareEbayDiscoveryCandidates,
  loadExistingEbayDiscoveryKeys,
  persistEbayDiscoveryRun
} from './ebayDiscovery.js';

const minutesToMs = (minutes: number): number => Math.max(1, minutes) * 60_000;
const schedulerRetryMinutes = 1;
const amazonMatchLimit = 3;
const scheduledDiscoveryTimeoutMinutes = 10;
const scheduledComparisonTimeoutMinutes = 8;
const errorRetryCooldownMinutes = 15;

interface EbayDiscoverySchedulerTarget {
  profileKey: string;
  categoryKey: string;
  query: string;
}

interface EbayAmazonComparisonCandidate {
  id: string;
  title: string;
  ebayScore: number;
}

type EbayAmazonComparisonCandidateSnapshot = Array<{
  id: string;
  title: string;
  ebayScore: number;
}>;

type EbayAmazonComparisonRunDelegate = {
  create(args: {
    data: { mode: 'AUTO' | 'MANUAL'; status: 'RUNNING' };
    select: { id: true };
  }): Promise<{ id: string }>;
  update(args: {
    where: { id: string };
    data: {
      status: 'COMPLETED' | 'SKIPPED' | 'FAILED';
      selectedCount: number;
      comparedCount: number;
      opportunityCount: number;
      manualReviewCount: number;
      rejectedCount: number;
      keepaTokensLeft?: number;
      keepaRetryAfterSeconds?: number;
      keepaRequestedTokens?: number;
      selectedCandidates: EbayAmazonComparisonCandidateSnapshot;
      reason?: string;
      error?: string;
      completedAt: Date;
    };
  }): Promise<unknown>;
};

const comparisonRunDb = prisma as typeof prisma & { ebayAmazonComparisonRun: EbayAmazonComparisonRunDelegate };

interface EbayAmazonComparisonRunOptions {
  mode?: 'AUTO' | 'MANUAL';
}

interface EbayAmazonComparisonRunResult {
  enabled: boolean;
  selected: Array<{ id: string; title: string; ebayScore: number }>;
  compared: number;
  opportunities: number;
  manualReviews: number;
  rejected: number;
  keepa?: {
    tokensLeft?: number;
    retryAfterSeconds?: number;
    requestedTokens?: number;
  };
  reason?: string;
}

class SchedulerTimeoutError extends Error {
  constructor(label: string, timeoutMinutes: number) {
    super(`${label} did not finish within ${timeoutMinutes} minutes; releasing scheduler for the next tick.`);
    this.name = 'SchedulerTimeoutError';
  }
}

function withTimeout<T>(work: Promise<T>, label: string, timeoutMinutes: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new SchedulerTimeoutError(label, timeoutMinutes)), minutesToMs(timeoutMinutes));
    work.then(
      (value) => {
        clearTimeout(timeout as NodeJS.Timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout as NodeJS.Timeout);
        reject(error);
      }
    );
  });
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof SerpApiError) {
    try {
      const payload = JSON.parse(error.body) as Record<string, unknown>;
      const message = typeof payload.error === 'string' ? payload.error : undefined;
      if (message) return `SerpAPI ${error.status}: ${message}`;
    } catch {
      // Keep the raw trimmed body below.
    }
    const body = error.body.trim();
    return body ? `SerpAPI ${error.status}: ${body}` : `SerpAPI ${error.status}`;
  }
  return error instanceof Error ? error.message : 'Scheduled job failed.';
}

async function persistFailedEbayDiscoveryRun(
  target: EbayDiscoverySchedulerTarget,
  ruleConfig: Awaited<ReturnType<typeof getActiveRuleConfig>>,
  error: unknown
): Promise<void> {
  const message = publicErrorMessage(error);
  await prisma.ebayDiscoveryRun.create({
    data: {
      profileKey: target.profileKey,
      categoryKey: target.categoryKey,
      query: target.query,
      mode: 'AUTO',
      status: 'FAILED',
      filtersJson: {
        mode: 'AUTO',
        profileKey: target.profileKey,
        categoryKey: target.categoryKey,
        query: target.query,
        limit: ruleConfig.ebayDiscoveryAutoRunLimit,
        error: message
      },
      scannedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      error: message,
      completedAt: new Date()
    }
  });
}

async function nextAmazonComparisonCandidates(compareLimit: number): Promise<EbayAmazonComparisonCandidate[]> {
  const baseWhere = {
    safetyStatus: { not: 'REJECT' },
    soldPrice: { not: null }
  } as const;
  const freshCandidates = await prisma.ebayDiscoveryCandidate.findMany({
    where: {
      ...baseWhere,
      comparisonStatus: 'NOT_COMPARED'
    },
    orderBy: [{ ebayScore: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: compareLimit
  }) as EbayAmazonComparisonCandidate[];

  if (freshCandidates.length >= compareLimit) return freshCandidates;

  const retryBefore = new Date(Date.now() - minutesToMs(errorRetryCooldownMinutes));
  const retryCandidates = await prisma.ebayDiscoveryCandidate.findMany({
    where: {
      ...baseWhere,
      comparisonStatus: 'ERROR',
      updatedAt: { lte: retryBefore },
      id: { notIn: freshCandidates.map((candidate) => candidate.id) }
    },
    orderBy: [{ ebayScore: 'desc' }, { updatedAt: 'asc' }, { createdAt: 'desc' }],
    take: compareLimit - freshCandidates.length
  }) as EbayAmazonComparisonCandidate[];

  return [...freshCandidates, ...retryCandidates];
}

async function startAmazonComparisonRun(mode: 'AUTO' | 'MANUAL'): Promise<{ id: string }> {
  return comparisonRunDb.ebayAmazonComparisonRun.create({
    data: {
      mode,
      status: 'RUNNING'
    },
    select: { id: true }
  });
}

async function finishAmazonComparisonRun(
  runId: string,
  status: 'COMPLETED' | 'SKIPPED' | 'FAILED',
  result: EbayAmazonComparisonRunResult,
  error?: unknown
): Promise<void> {
  const message = error ? publicErrorMessage(error) : undefined;
  await comparisonRunDb.ebayAmazonComparisonRun.update({
    where: { id: runId },
    data: {
      status,
      selectedCount: result.selected.length,
      comparedCount: result.compared,
      opportunityCount: result.opportunities,
      manualReviewCount: result.manualReviews,
      rejectedCount: result.rejected,
      keepaTokensLeft: result.keepa?.tokensLeft,
      keepaRetryAfterSeconds: result.keepa?.retryAfterSeconds,
      keepaRequestedTokens: result.keepa?.requestedTokens,
      selectedCandidates: result.selected,
      reason: result.reason,
      error: message,
      completedAt: new Date()
    }
  });
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

type ScheduledEbayDiscoveryResult = {
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
};

async function runScheduledEbayDiscoveryUnlocked(): Promise<ScheduledEbayDiscoveryResult> {
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
  const runOptions = {
    serpApiKey,
    ruleConfig,
    profileKey: target.profileKey,
    categoryKey: target.categoryKey,
    query: target.query,
    limit: ruleConfig.ebayDiscoveryAutoRunLimit,
    mode: 'AUTO' as const,
    safeMode: ruleConfig.safeMode,
    queryBreadth: 'FOCUSED' as const,
    skipExistingProducts: true,
    existingProductFamilyKeys: existingKeys.productFamilyKeys,
    existingEbayItemIds: existingKeys.ebayItemIds
  };
  let result: Awaited<ReturnType<typeof buildEbayDiscoveryCandidates>>;
  try {
    result = await buildEbayDiscoveryCandidates(runOptions);
    await persistEbayDiscoveryRun(prisma, runOptions, result);
  } catch (error) {
    await persistFailedEbayDiscoveryRun(target, ruleConfig, error);
    if (error instanceof SerpApiError && error.status === 429) {
      return {
        enabled: true,
        target,
        scanned: 0,
        accepted: 0,
        rejected: 0,
        skippedExisting: 0,
        compared: 0,
        opportunities: 0,
        comparisonSkippedReason: 'Amazon comparison is handled by the separate comparison auto-run.',
        reason: publicErrorMessage(error)
      };
    }
    throw error;
  }

  return {
    enabled: true,
    target,
    scanned: result.candidates.length + result.rejected.length + result.sourceDrops.total,
    accepted: result.candidates.length,
    rejected: result.rejected.length + result.sourceDropCandidates.length,
    skippedExisting: result.skippedExisting,
    compared: 0,
    opportunities: 0,
    comparisonSkippedReason: 'Amazon comparison is handled by the separate comparison auto-run.'
  };
}

export async function runScheduledEbayDiscovery(): Promise<ScheduledEbayDiscoveryResult> {
  const locked = await withSchedulerLock(prisma, {
    name: 'ebay-discovery-auto-run',
    ttlMs: minutesToMs(scheduledDiscoveryTimeoutMinutes + 1),
    metadata: { job: 'ebay-discovery-auto-run' }
  }, () => runScheduledEbayDiscoveryUnlocked());

  return locked.acquired
    ? locked.result
    : {
      enabled: true,
      scanned: 0,
      accepted: 0,
      rejected: 0,
      skippedExisting: 0,
      compared: 0,
      opportunities: 0,
      comparisonSkippedReason: 'Amazon comparison is handled by the separate comparison auto-run.',
      reason: 'eBay discovery auto-run is already running on another worker.'
    };
}

async function runScheduledEbayAmazonComparisonUnlocked(options: EbayAmazonComparisonRunOptions = {}): Promise<EbayAmazonComparisonRunResult> {
  const ruleConfig = await getActiveRuleConfig(prisma);
  const mode = options.mode ?? 'AUTO';
  if (mode === 'AUTO' && !ruleConfig.ebayAmazonCompareAutoRunEnabled) {
    return {
      enabled: false,
      selected: [],
      compared: 0,
      opportunities: 0,
      manualReviews: 0,
      rejected: 0,
      reason: 'Amazon comparison auto-run is disabled.'
    };
  }

  const run = await startAmazonComparisonRun(mode);
  const finish = async (
    result: EbayAmazonComparisonRunResult,
    status: 'COMPLETED' | 'SKIPPED' | 'FAILED' = result.compared > 0 ? 'COMPLETED' : 'SKIPPED'
  ): Promise<EbayAmazonComparisonRunResult> => {
    await finishAmazonComparisonRun(run.id, status, result);
    return result;
  };

  try {
    const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
    if (!keepaApiKey) {
      return finish({
        enabled: true,
        selected: [],
        compared: 0,
        opportunities: 0,
        manualReviews: 0,
        rejected: 0,
        reason: 'KEEPA_API_KEY is not configured.'
      });
    }

    const compareLimit = Math.min(Math.max(ruleConfig.ebayAmazonCompareAutoRunLimit, 1), 25);
    const candidates = await nextAmazonComparisonCandidates(compareLimit);

    const selected = candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      ebayScore: candidate.ebayScore
    }));

    if (!candidates.length) {
      return finish({
        enabled: true,
        selected,
        compared: 0,
        opportunities: 0,
        manualReviews: 0,
        rejected: 0,
        reason: 'No pending eBay products are ready for Amazon comparison.'
      });
    }

    const requestedTokens = candidates.length * amazonMatchLimit;
    let keepaSummary: { tokensLeft?: number; retryAfterSeconds?: number; requestedTokens?: number };
    let affordableCompareLimit = candidates.length;
    try {
      const tokenStatus = await getKeepaTokenStatus(keepaApiKey);
      keepaSummary = {
        tokensLeft: tokenStatus.tokensLeft,
        retryAfterSeconds: tokenStatus.retryAfterSeconds,
        requestedTokens
      };
      affordableCompareLimit = Math.min(candidates.length, Math.floor(Math.max(tokenStatus.tokensLeft, 0) / amazonMatchLimit));
    } catch (error) {
      if (!(error instanceof KeepaApiError)) throw error;
      let retryAfterSeconds: number | undefined;
      let tokensLeft: number | undefined;
      try {
        const payload = JSON.parse(error.body) as Record<string, unknown>;
        tokensLeft = typeof payload.tokensLeft === 'number' ? payload.tokensLeft : undefined;
        retryAfterSeconds = typeof payload.refillIn === 'number' && payload.refillIn > 0 ? Math.ceil(payload.refillIn / 1000) : undefined;
      } catch {
        // Keepa sometimes returns text bodies.
      }
      return finish({
        enabled: true,
        selected,
        compared: 0,
        opportunities: 0,
        manualReviews: 0,
        rejected: 0,
        keepa: { tokensLeft, retryAfterSeconds, requestedTokens },
        reason: retryAfterSeconds
          ? `Keepa rate limit reached; retry after about ${retryAfterSeconds} seconds.`
          : 'Keepa rate limit reached.'
      });
    }

    if (affordableCompareLimit <= 0) {
      return finish({
        enabled: true,
        selected,
        compared: 0,
        opportunities: 0,
        manualReviews: 0,
        rejected: 0,
        keepa: keepaSummary,
        reason: keepaSummary.retryAfterSeconds
          ? `Keepa has ${keepaSummary.tokensLeft} tokens; retry after about ${keepaSummary.retryAfterSeconds} seconds.`
          : `Keepa has ${keepaSummary.tokensLeft} tokens; Amazon comparison was skipped.`
      });
    }

    const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
    const comparisonCandidates = candidates.slice(0, affordableCompareLimit);
    let comparison: Awaited<ReturnType<typeof compareEbayDiscoveryCandidates>>;
    try {
      comparison = await compareEbayDiscoveryCandidates({
        db: prisma,
        keepaApiKey,
        serpApiKey,
        ruleConfig,
        candidateIds: comparisonCandidates.map((candidate) => candidate.id),
        limit: comparisonCandidates.length,
        amazonMatchLimit,
        force: true
      });
    } catch (error) {
      if (!(error instanceof KeepaApiError)) throw error;
      return finish({
        enabled: true,
        selected: comparisonCandidates.map((candidate) => ({
          id: candidate.id,
          title: candidate.title,
          ebayScore: candidate.ebayScore
        })),
        compared: 0,
        opportunities: 0,
        manualReviews: 0,
        rejected: 0,
        keepa: keepaSummary,
        reason: 'Keepa rate limit reached during Amazon comparison; selected products remain queued for retry.'
      });
    }

    return finish({
      enabled: true,
      selected: comparisonCandidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        ebayScore: candidate.ebayScore
      })),
      compared: comparison.compared,
      opportunities: comparison.opportunities.length,
      manualReviews: comparison.manualReviews.length,
      rejected: comparison.rejectedCount,
      keepa: keepaSummary,
      reason: affordableCompareLimit < candidates.length
        ? `Compared ${affordableCompareLimit} products now; ${candidates.length - affordableCompareLimit} remain queued until Keepa tokens refill.`
        : undefined
    }, 'COMPLETED');
  } catch (error) {
    await finishAmazonComparisonRun(run.id, 'FAILED', {
      enabled: true,
      selected: [],
      compared: 0,
      opportunities: 0,
      manualReviews: 0,
      rejected: 0,
      reason: publicErrorMessage(error)
    }, error);
    throw error;
  }
}

export async function runScheduledEbayAmazonComparison(options: EbayAmazonComparisonRunOptions = {}): Promise<EbayAmazonComparisonRunResult> {
  const mode = options.mode ?? 'AUTO';
  if (mode === 'AUTO') {
    const ruleConfig = await getActiveRuleConfig(prisma);
    if (!ruleConfig.ebayAmazonCompareAutoRunEnabled) {
      return {
        enabled: false,
        selected: [],
        compared: 0,
        opportunities: 0,
        manualReviews: 0,
        rejected: 0,
        reason: 'Amazon comparison auto-run is disabled.'
      };
    }
  }

  const locked = await withSchedulerLock(prisma, {
    name: 'ebay-amazon-comparison-auto-run',
    ttlMs: minutesToMs(scheduledComparisonTimeoutMinutes + 1),
    metadata: { job: 'ebay-amazon-comparison-auto-run', mode }
  }, () => runScheduledEbayAmazonComparisonUnlocked({ ...options, mode }));

  return locked.acquired
    ? locked.result
    : {
      enabled: true,
      selected: [],
      compared: 0,
      opportunities: 0,
      manualReviews: 0,
      rejected: 0,
      reason: 'Amazon comparison auto-run is already running on another worker.'
    };
}

let schedulerRunning = false;
let comparisonSchedulerRunning = false;

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
      withTimeout(runScheduledEbayDiscovery(), 'Scheduled eBay discovery', scheduledDiscoveryTimeoutMinutes)
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

export function startEbayAmazonComparisonScheduler(app: FastifyInstance): void {
  const scheduleNext = async (): Promise<void> => {
    let intervalMinutes = schedulerRetryMinutes;
    try {
      const config = await getActiveRuleConfig(prisma);
      intervalMinutes = config.ebayAmazonCompareAutoRunIntervalMinutes;
    } catch (error) {
      app.log.error({ error }, 'eBay Amazon comparison scheduler could not load config; retrying soon');
    }

    setTimeout(() => {
      if (comparisonSchedulerRunning) {
        app.log.info('eBay Amazon comparison scheduler tick skipped because a previous run is still active');
        scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay Amazon comparison scheduling failed'));
        return;
      }

      comparisonSchedulerRunning = true;
      withTimeout(runScheduledEbayAmazonComparison({ mode: 'AUTO' }), 'Scheduled eBay Amazon comparison', scheduledComparisonTimeoutMinutes)
        .then((result) => {
          if (result.enabled) app.log.info({ result }, 'Scheduled eBay Amazon comparison completed');
        })
        .catch((error: unknown) => app.log.error({ error }, 'Scheduled eBay Amazon comparison failed'))
        .finally(() => {
          comparisonSchedulerRunning = false;
          scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay Amazon comparison scheduling failed'));
        });
    }, minutesToMs(intervalMinutes));
  };

  scheduleNext().catch((error: unknown) => app.log.error({ error }, 'eBay Amazon comparison scheduler failed to start'));
}
