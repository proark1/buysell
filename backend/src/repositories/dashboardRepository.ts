import type { PrismaClient } from '@prisma/client';
import { getActiveRuleConfig } from './ruleConfigRepository.js';
import { rejectionStageForFlag } from '../services/discoveryPolicy.js';

type EbayAmazonComparisonRunDashboardDelegate = {
  findMany(args: { orderBy: { startedAt: 'desc' }; take: number }): Promise<unknown[]>;
  count(args?: unknown): Promise<number>;
};

type DashboardPrismaClient = PrismaClient & {
  ebayAmazonComparisonRun: EbayAmazonComparisonRunDashboardDelegate;
};

const dashboardDiscoveryCandidateDefaultTake = 500;

const amazonDiscoveryCandidateSelect = {
  id: true,
  runId: true,
  asin: true,
  title: true,
  amazonUrl: true,
  brand: true,
  rootCategory: true,
  categoryTree: true,
  currentPrice: true,
  buyBoxPrice: true,
  avg90Price: true,
  priceDropPercent: true,
  availabilityStatus: true,
  salesRank: true,
  rating: true,
  reviewCount: true,
  amazonScore: true,
  safetyStatus: true,
  riskFlags: true,
  scoreBreakdown: true,
  selected: true,
  comparisonStatus: true,
  productCandidateId: true,
  amazonMatchId: true,
  createdAt: true,
  updatedAt: true
};

const ebayDiscoveryCandidateSelect = {
  id: true,
  runId: true,
  ebayItemId: true,
  productFamilyKey: true,
  sourceQuery: true,
  title: true,
  ebayUrl: true,
  soldPrice: true,
  shippingPrice: true,
  condition: true,
  category: true,
  categoryId: true,
  familySoldCount: true,
  familyMinSoldPrice: true,
  familyMedianSoldPrice: true,
  familyMaxSoldPrice: true,
  ebayScore: true,
  safetyStatus: true,
  riskFlags: true,
  scoreBreakdown: true,
  selected: true,
  comparisonStatus: true,
  productCandidateId: true,
  amazonMatchId: true,
  createdAt: true,
  updatedAt: true
};

const numberValue = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber();
  return 0;
};

const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : [];

// Compute all four rejection-stage buckets in a single pass over the sampled rows (was four
// separate full filters). Semantics are unchanged: a candidate counts in every bucket whose
// stage set its flags touch.
interface RejectionBuckets { source: number; safety: number; matching: number; economics: number }

function rejectionStageBuckets(rows: Array<{ riskFlags: unknown }>): RejectionBuckets {
  const buckets = { source: 0, safety: 0, matching: 0, economics: 0 };
  for (const row of rows) {
    const stages = new Set(stringArray(row.riskFlags).map(rejectionStageForFlag));
    if (stages.has('SOURCE_DATA') || stages.has('SOURCE_FORMAT')) buckets.source += 1;
    if (stages.has('SAFETY') || stages.has('SOURCE_COST')) buckets.safety += 1;
    if (stages.has('MATCHING')) buckets.matching += 1;
    if (stages.has('ECONOMICS') || stages.has('SCORING')) buckets.economics += 1;
  }
  return buckets;
}

export async function getPipelineSummary(db: PrismaClient): Promise<unknown> {
  const dashboardDb = db as DashboardPrismaClient;
  const [
    ebayQueued,
    ebayComparing,
    ebayOpportunities,
    ebayManualReview,
    ebayRejected,
    legacyRejectedRows,
    ebayErrors,
    verifyActions,
    listingActions,
    activeListings,
    humanConfirmation,
    automationFailures,
    priceObservations,
    inventoryWatching,
    familyCount,
    realizedProfit,
    topOpportunities,
    topFamilies,
    schedulerLocks,
    recentFeedback,
    recentComparisonRuns
  ] = await Promise.all([
    db.ebayDiscoveryCandidate.count({ where: { comparisonStatus: 'NOT_COMPARED' } }),
    db.ebayDiscoveryCandidate.count({ where: { comparisonStatus: 'COMPARING' } }),
    db.ebayDiscoveryCandidate.count({ where: { comparisonStatus: 'OPPORTUNITY' } }),
    db.ebayDiscoveryCandidate.count({ where: { comparisonStatus: 'MANUAL_REVIEW' } }),
    db.ebayDiscoveryCandidate.count({ where: { comparisonStatus: 'REJECTED' } }),
    db.ebayDiscoveryCandidate.findMany({
      // Legacy rows (rejected before the rejectionStage column existed) are still counted via
      // the JS pass; rows with a stage are counted exactly via groupBy below.
      where: { comparisonStatus: 'REJECTED', rejectionStage: null },
      select: { riskFlags: true },
      take: 5000
    }),
    db.ebayDiscoveryCandidate.count({ where: { comparisonStatus: 'ERROR' } }),
    db.actionItem.count({ where: { type: 'VERIFY', status: { in: ['PENDING', 'APPROVED'] } } }),
    db.actionItem.count({ where: { type: 'LIST', status: { in: ['PENDING', 'APPROVED'] } } }),
    db.ebayListing.count({ where: { listingStatus: 'ACTIVE' } }),
    db.automationRun.count({ where: { status: 'NEEDS_HUMAN_CONFIRMATION' } }),
    db.automationRun.count({ where: { status: { in: ['FAILED', 'REVIEW_REQUIRED'] } } }),
    db.priceObservation.count(),
    db.sourceInventoryRecord.count({ where: { status: 'WATCHING' } }),
    db.productFamily.count(),
    db.profitLedgerEntry.aggregate({ _sum: { netProfit: true } }),
    db.productCandidate.findMany({
      orderBy: [{ opportunityScore: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      include: {
        amazonMatches: { orderBy: { createdAt: 'desc' }, take: 1 },
        profitSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        aiDecisions: { orderBy: { createdAt: 'desc' }, take: 1 },
        productFamily: true
      }
    }),
    db.productFamily.findMany({
      orderBy: [{ opportunityCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: 10
    }),
    db.schedulerLock.findMany({ orderBy: { leasedUntil: 'desc' }, take: 10 }),
    db.opportunityFeedback.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    dashboardDb.ebayAmazonComparisonRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 })
  ]);

  const plTrend = await getPlTrend(db);

  // Exact, scalable stage counts via groupBy for rows that carry a rejectionStage, summed
  // with the JS fallback for legacy (null-stage) rows. Stage -> funnel bucket mapping.
  const stageBucketOf = (stage: string | null): keyof RejectionBuckets | undefined => {
    if (stage === 'SOURCE_DATA' || stage === 'SOURCE_FORMAT') return 'source';
    if (stage === 'SAFETY' || stage === 'SOURCE_COST') return 'safety';
    if (stage === 'MATCHING') return 'matching';
    if (stage === 'ECONOMICS' || stage === 'SCORING') return 'economics';
    return undefined;
  };
  const rejectionStageGroups = await db.ebayDiscoveryCandidate.groupBy({
    by: ['rejectionStage'],
    where: { comparisonStatus: 'REJECTED', rejectionStage: { not: null } },
    _count: { _all: true }
  });
  const rejectionBuckets = rejectionStageBuckets(legacyRejectedRows as Array<{ riskFlags: unknown }>);
  for (const group of rejectionStageGroups as Array<{ rejectionStage: string | null; _count: { _all: number } }>) {
    const bucket = stageBucketOf(group.rejectionStage);
    if (bucket) rejectionBuckets[bucket] += group._count._all;
  }
  return {
    plTrend,
    funnel: {
      ebayQueued,
      ebayComparing,
      ebayOpportunities,
      ebayManualReview,
      ebayRejected,
      ebaySourceRejected: rejectionBuckets.source,
      ebaySafetyRejected: rejectionBuckets.safety,
      ebayMatchingRejected: rejectionBuckets.matching,
      ebayEconomicsRejected: rejectionBuckets.economics,
      ebayErrors,
      verifyActions,
      listingActions,
      activeListings,
      humanConfirmation,
      automationFailures
    },
    observability: {
      priceObservations,
      inventoryWatching,
      productFamilies: familyCount,
      realizedProfit: numberValue(realizedProfit._sum.netProfit)
    },
    topOpportunities,
    topFamilies,
    schedulerLocks,
    recentFeedback,
    recentComparisonRuns
  };
}

type PlTrendPoint = { t: string; v: number };

export async function getPlTrend(
  db: PrismaClient
): Promise<{ points: PlTrendPoint[]; total: number; source: 'ledger' | 'cashflow' | 'none' }> {
  const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
  const daily = new Map<string, number>();
  let source: 'ledger' | 'cashflow' | 'none' = 'none';

  const ledger = await db.profitLedgerEntry.findMany({
    where: { realizedAt: { gte: since } },
    select: { netProfit: true, realizedAt: true },
    orderBy: { realizedAt: 'asc' }
  });

  if (ledger.length > 0) {
    source = 'ledger';
    for (const entry of ledger) {
      const key = dayKey(entry.realizedAt);
      daily.set(key, (daily.get(key) ?? 0) + num(entry.netProfit));
    }
  } else {
    const [orders, purchases] = await Promise.all([
      db.order.findMany({ where: { createdAt: { gte: since } }, select: { salePrice: true, createdAt: true } }),
      db.amazonPurchase.findMany({
        where: { createdAt: { gte: since } },
        select: { purchasePrice: true, createdAt: true }
      })
    ]);
    if (orders.length > 0 || purchases.length > 0) {
      source = 'cashflow';
      for (const order of orders) {
        const key = dayKey(order.createdAt);
        daily.set(key, (daily.get(key) ?? 0) + num(order.salePrice));
      }
      for (const purchase of purchases) {
        const key = dayKey(purchase.createdAt);
        daily.set(key, (daily.get(key) ?? 0) - num(purchase.purchasePrice));
      }
    }
  }

  const keys = Array.from(daily.keys()).sort();
  let cumulative = 0;
  const points: PlTrendPoint[] = keys.map((key) => {
    cumulative += daily.get(key) ?? 0;
    return { t: key, v: Math.round(cumulative * 100) / 100 };
  });

  return { points, total: Math.round(cumulative * 100) / 100, source };
}

export async function getDashboardData(db: PrismaClient): Promise<unknown> {
  const dashboardDb = db as DashboardPrismaClient;
  const [
    productCandidates,
    amazonMatches,
    ebayListings,
    orders,
    actions,
    purchases,
    discoveryScanRuns,
    amazonDiscoveryRuns,
    ebayDiscoveryRuns,
    ebayAmazonComparisonRuns,
    automationRuns,
    ruleConfig,
    pipeline
  ] = await Promise.all([
    db.productCandidate.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.amazonMatch.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.ebayListing.findMany({ orderBy: { updatedAt: 'desc' }, take: 25 }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.actionItem.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }], take: 50 }),
    db.amazonPurchase.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.discoveryScanRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    db.amazonDiscoveryRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
      include: {
        candidates: {
          select: amazonDiscoveryCandidateSelect,
          orderBy: [{ comparisonStatus: 'asc' }, { amazonScore: 'desc' }, { createdAt: 'desc' }],
          take: 100
        }
      }
    }),
    db.ebayDiscoveryRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
      include: {
        candidates: {
          select: ebayDiscoveryCandidateSelect,
          orderBy: [{ comparisonStatus: 'asc' }, { ebayScore: 'desc' }, { createdAt: 'desc' }],
          take: 100
        }
      }
    }),
    dashboardDb.ebayAmazonComparisonRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20
    }),
    db.automationRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 25,
      include: {
        actionItem: {
          select: {
            id: true,
            type: true,
            status: true,
            priority: true,
            reason: true
          }
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 3
        },
        artifacts: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    }),
    getActiveRuleConfig(db),
    getPipelineSummary(db)
  ]);
  const amazonDiscoveryCandidates = amazonDiscoveryRuns[0]?.candidates ?? [];
  const ebayDiscoveryCandidates = ebayDiscoveryRuns[0]?.candidates ?? [];

  // Run the summary counts concurrently instead of 13 serial round-trips.
  const [
    productCandidatesCount,
    amazonMatchesCount,
    ebayListingsCount,
    ordersCount,
    actionsCount,
    purchasesCount,
    discoveryScansCount,
    amazonScoutsCount,
    ebayDiscoveriesCount,
    ebayAmazonComparisonsCount,
    automationRunsCount,
    automationNeedsConfirmationCount,
    automationFailuresCount
  ] = await Promise.all([
    db.productCandidate.count(),
    db.amazonMatch.count(),
    db.ebayListing.count(),
    db.order.count(),
    db.actionItem.count(),
    db.amazonPurchase.count(),
    db.discoveryScanRun.count(),
    db.amazonDiscoveryRun.count(),
    db.ebayDiscoveryRun.count(),
    dashboardDb.ebayAmazonComparisonRun.count(),
    db.automationRun.count(),
    db.automationRun.count({ where: { status: 'NEEDS_HUMAN_CONFIRMATION' } }),
    db.automationRun.count({ where: { status: { in: ['FAILED', 'REVIEW_REQUIRED'] } } })
  ]);

  return {
    counts: {
      productCandidates: productCandidatesCount,
      amazonMatches: amazonMatchesCount,
      ebayListings: ebayListingsCount,
      orders: ordersCount,
      actions: actionsCount,
      purchases: purchasesCount,
      discoveryScans: discoveryScansCount,
      amazonScouts: amazonScoutsCount,
      ebayDiscoveries: ebayDiscoveriesCount,
      ebayAmazonComparisons: ebayAmazonComparisonsCount,
      automationRuns: automationRunsCount,
      automationNeedsConfirmation: automationNeedsConfirmationCount,
      automationFailures: automationFailuresCount
    },
    productCandidates,
    amazonMatches,
    ebayListings,
    orders,
    actions,
    purchases,
    discoveryScanRuns,
    amazonDiscoveryRuns,
    amazonDiscoveryCandidates,
    ebayDiscoveryRuns,
    ebayAmazonComparisonRuns,
    ebayDiscoveryCandidates,
    allEbayDiscoveryCandidates: [],
    allEbayDiscoveryCandidatesLoaded: false,
    automationRuns,
    ruleConfig,
    pipeline
  };
}

export async function getDashboardDiscoveryCandidates(db: PrismaClient, take = dashboardDiscoveryCandidateDefaultTake): Promise<unknown> {
  const limit = Math.min(Math.max(take, 1), 2000);
  const [allEbayDiscoveryCandidates, total] = await Promise.all([
    db.ebayDiscoveryCandidate.findMany({
      select: ebayDiscoveryCandidateSelect,
      orderBy: [{ updatedAt: 'desc' }, { ebayScore: 'desc' }],
      take: limit
    }),
    db.ebayDiscoveryCandidate.count()
  ]);

  return {
    allEbayDiscoveryCandidates,
    total,
    take: limit
  };
}
