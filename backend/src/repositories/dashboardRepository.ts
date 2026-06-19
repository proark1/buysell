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

function countRejectedStage(rows: Array<{ riskFlags: unknown }>, stages: string[]): number {
  const stageSet = new Set(stages);
  return rows.filter((row) => {
    const rowStages = stringArray(row.riskFlags).map(rejectionStageForFlag);
    return rowStages.some((stage) => stageSet.has(stage));
  }).length;
}

export async function getPipelineSummary(db: PrismaClient): Promise<unknown> {
  const dashboardDb = db as DashboardPrismaClient;
  const [
    ebayQueued,
    ebayComparing,
    ebayOpportunities,
    ebayManualReview,
    ebayRejected,
    rejectedEbayRows,
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
      where: { comparisonStatus: 'REJECTED' },
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

  return {
    funnel: {
      ebayQueued,
      ebayComparing,
      ebayOpportunities,
      ebayManualReview,
      ebayRejected,
      ebaySourceRejected: countRejectedStage(rejectedEbayRows as Array<{ riskFlags: unknown }>, ['SOURCE_DATA', 'SOURCE_FORMAT']),
      ebaySafetyRejected: countRejectedStage(rejectedEbayRows as Array<{ riskFlags: unknown }>, ['SAFETY', 'SOURCE_COST']),
      ebayMatchingRejected: countRejectedStage(rejectedEbayRows as Array<{ riskFlags: unknown }>, ['MATCHING']),
      ebayEconomicsRejected: countRejectedStage(rejectedEbayRows as Array<{ riskFlags: unknown }>, ['ECONOMICS', 'SCORING']),
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

  return {
    counts: {
      productCandidates: await db.productCandidate.count(),
      amazonMatches: await db.amazonMatch.count(),
      ebayListings: await db.ebayListing.count(),
      orders: await db.order.count(),
      actions: await db.actionItem.count(),
      purchases: await db.amazonPurchase.count(),
      discoveryScans: await db.discoveryScanRun.count(),
      amazonScouts: await db.amazonDiscoveryRun.count(),
      ebayDiscoveries: await db.ebayDiscoveryRun.count(),
      ebayAmazonComparisons: await dashboardDb.ebayAmazonComparisonRun.count(),
      automationRuns: await db.automationRun.count(),
      automationNeedsConfirmation: await db.automationRun.count({ where: { status: 'NEEDS_HUMAN_CONFIRMATION' } }),
      automationFailures: await db.automationRun.count({ where: { status: { in: ['FAILED', 'REVIEW_REQUIRED'] } } })
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
      orderBy: [{ createdAt: 'desc' }, { ebayScore: 'desc' }],
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
