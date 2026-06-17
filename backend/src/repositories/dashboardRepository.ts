import type { PrismaClient } from '@prisma/client';

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

export async function getDashboardData(db: PrismaClient): Promise<unknown> {
  const [
    productCandidates,
    amazonMatches,
    ebayListings,
    orders,
    actions,
    purchases,
    discoveryScanRuns,
    amazonDiscoveryRuns,
    ruleConfig
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
    db.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } })
  ]);
  const amazonDiscoveryCandidates = amazonDiscoveryRuns[0]?.candidates ?? [];

  return {
    counts: {
      productCandidates: await db.productCandidate.count(),
      amazonMatches: await db.amazonMatch.count(),
      ebayListings: await db.ebayListing.count(),
      orders: await db.order.count(),
      actions: await db.actionItem.count(),
      purchases: await db.amazonPurchase.count(),
      discoveryScans: await db.discoveryScanRun.count(),
      amazonScouts: await db.amazonDiscoveryRun.count()
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
    ruleConfig
  };
}
