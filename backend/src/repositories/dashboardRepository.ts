import type { PrismaClient } from '@prisma/client';

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
    amazonDiscoveryCandidates,
    ruleConfig
  ] = await Promise.all([
    db.productCandidate.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.amazonMatch.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.ebayListing.findMany({ orderBy: { updatedAt: 'desc' }, take: 25 }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.actionItem.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }], take: 50 }),
    db.amazonPurchase.findMany({ orderBy: { createdAt: 'desc' }, take: 25 }),
    db.discoveryScanRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    db.amazonDiscoveryRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    db.amazonDiscoveryCandidate.findMany({ orderBy: [{ amazonScore: 'desc' }, { createdAt: 'desc' }], take: 50 }),
    db.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } })
  ]);

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
