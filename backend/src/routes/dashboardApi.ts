import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { getDashboardData, getDashboardDiscoveryCandidates, getPipelineSummary } from '../repositories/dashboardRepository.js';
import { defaultRuleConfig, getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { runLockedAmazonPriceMonitor } from '../services/amazonPriceMonitorScheduler.js';
import { runScheduledEbayAmazonComparison, runScheduledEbayDiscovery } from '../services/ebayDiscoveryScheduler.js';

const settingsSchema = z.object({
  minimumProfitUsd: z.number().min(0).optional(),
  minimumRoiPercent: z.number().min(0).optional(),
  minimumMatchConfidence: z.number().min(0).max(1).optional(),
  estimatedSalesTaxRate: z.number().min(0).max(1).optional(),
  returnRiskBuffer: z.number().min(0).optional(),
  priceChangeBuffer: z.number().min(0).optional(),
  sourceShippingCost: z.number().min(0).optional(),
  packagingCost: z.number().min(0).optional(),
  paymentFixedFee: z.number().min(0).optional(),
  defaultPromotedListingFeeRate: z.number().min(0).max(1).optional(),
  returnReserveRate: z.number().min(0).max(1).optional(),
  cancellationReserveRate: z.number().min(0).max(1).optional(),
  marketplaceRiskBuffer: z.number().min(0).optional(),
  minimumSellThroughRate: z.number().min(0).max(1).optional(),
  maximumCompetitionRatio: z.number().positive().optional(),
  maxDailyListings: z.number().int().positive().optional(),
  maxDailyPurchaseAmountUsd: z.number().positive().optional(),
  safeMode: z.boolean().optional(),
  maxAmazonCostUsd: z.number().positive().optional(),
  minimumOpportunityScore: z.number().int().min(0).max(100).optional(),
  blockedCategories: z.array(z.string()).optional(),
  blockedKeywords: z.array(z.string()).optional(),
  allowedCategories: z.array(z.string()).optional(),
  amazonPriceCheckIntervalMinutes: z.number().int().positive().optional(),
  ebayDiscoveryAutoRunEnabled: z.boolean().optional(),
  ebayDiscoveryAutoRunIntervalMinutes: z.number().int().positive().max(1440).optional(),
  ebayDiscoveryAutoRunLimit: z.number().int().positive().max(25).optional(),
  ebayDiscoveryAutoCompareEnabled: z.boolean().optional(),
  ebayAmazonCompareAutoRunEnabled: z.boolean().optional(),
  ebayAmazonCompareAutoRunIntervalMinutes: z.number().int().positive().max(1440).optional(),
  ebayAmazonCompareAutoRunLimit: z.number().int().positive().max(25).optional()
});

const discoveryCandidatesQuerySchema = z.object({
  take: z.coerce.number().int().positive().max(2000).default(500)
});

type RuleConfigPatchValue = string | number | boolean | string[] | undefined;
type RuleConfigPatch = Record<string, RuleConfigPatchValue>;

type EbayAmazonComparisonRunRouteDelegate = {
  updateMany(args: {
    where: { mode: 'AUTO'; status: 'RUNNING' };
    data: {
      status: 'CANCELLED';
      reason: string;
      completedAt: Date;
    };
  }): Promise<{ count: number }>;
};

const routeDb = prisma as typeof prisma & { ebayAmazonComparisonRun: EbayAmazonComparisonRunRouteDelegate };

async function patchRuleConfig(data: RuleConfigPatch): Promise<unknown> {
  const existing = await prisma.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
  return existing
    ? prisma.ruleConfig.update({ where: { id: existing.id }, data })
    : prisma.ruleConfig.create({ data: { id: 'default-rule-config', name: 'default', active: true, ...data } });
}

async function cancelRunningEbayDiscoveryAutoRuns(reason: string): Promise<number> {
  const result = await prisma.ebayDiscoveryRun.updateMany({
    where: { mode: 'AUTO', status: 'RUNNING' },
    data: { status: 'CANCELLED', error: reason, completedAt: new Date() }
  });
  return result.count;
}

async function cancelRunningAmazonComparisonAutoRuns(reason: string): Promise<number> {
  const result = await routeDb.ebayAmazonComparisonRun.updateMany({
    where: { mode: 'AUTO', status: 'RUNNING' },
    data: { status: 'CANCELLED', reason, completedAt: new Date() }
  });
  return result.count;
}

async function releaseComparingEbayCandidates(): Promise<number> {
  const result = await prisma.ebayDiscoveryCandidate.updateMany({
    where: { comparisonStatus: 'COMPARING' },
    data: { comparisonStatus: 'NOT_COMPARED', selected: false }
  });
  return result.count;
}

export async function registerDashboardApiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health/db', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { connected: true };
    } catch {
      return { connected: false, error: 'Database unavailable' };
    }
  });

  app.get('/api/dashboard', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return getDashboardData(prisma);
  });

  app.get('/api/pipeline', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return getPipelineSummary(prisma);
  });

  app.get('/api/dashboard/discovery-candidates', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = discoveryCandidatesQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid discovery candidates query', details: parsed.error.flatten() });
    return getDashboardDiscoveryCandidates(prisma, parsed.data.take);
  });

  app.get('/api/settings', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return getActiveRuleConfig(prisma);
  });

  app.patch('/api/settings', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid settings payload', details: parsed.error.flatten() });
    const decimalKeys = new Set([
      'minimumProfitUsd',
      'minimumRoiPercent',
      'minimumMatchConfidence',
      'estimatedSalesTaxRate',
      'returnRiskBuffer',
      'priceChangeBuffer',
      'sourceShippingCost',
      'packagingCost',
      'paymentFixedFee',
      'defaultPromotedListingFeeRate',
      'returnReserveRate',
      'cancellationReserveRate',
      'marketplaceRiskBuffer',
      'minimumSellThroughRate',
      'maximumCompetitionRatio',
      'maxDailyPurchaseAmountUsd',
      'maxAmazonCostUsd'
    ]);
    const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, typeof value === 'number' && decimalKeys.has(key) ? String(value) : value])) as RuleConfigPatch;
    const ruleConfig = await patchRuleConfig(data);
    return { ruleConfig };
  });

  app.post('/api/monitor/amazon-prices/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return runLockedAmazonPriceMonitor();
  });

  app.post('/api/ebay-discovery/auto-run/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return runScheduledEbayDiscovery();
  });

  app.post('/api/ebay-discovery/auto-run/stop', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const ruleConfig = await patchRuleConfig({ ebayDiscoveryAutoRunEnabled: false });
    const cancelledRuns = await cancelRunningEbayDiscoveryAutoRuns('eBay auto-run stopped by user.');
    return { stopped: true, deleted: false, cancelledRuns, ruleConfig };
  });

  app.post('/api/ebay-discovery/auto-run/delete', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const ruleConfig = await patchRuleConfig({
      ebayDiscoveryAutoRunEnabled: false,
      ebayDiscoveryAutoRunIntervalMinutes: defaultRuleConfig.ebayDiscoveryAutoRunIntervalMinutes,
      ebayDiscoveryAutoRunLimit: defaultRuleConfig.ebayDiscoveryAutoRunLimit
    });
    const cancelledRuns = await cancelRunningEbayDiscoveryAutoRuns('eBay auto-run deleted by user.');
    return { stopped: true, deleted: true, cancelledRuns, ruleConfig };
  });

  app.post('/api/ebay-discovery/amazon-compare-auto-run/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return runScheduledEbayAmazonComparison({ mode: 'MANUAL' });
  });

  app.post('/api/ebay-discovery/amazon-compare-auto-run/start', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const ruleConfig = await patchRuleConfig({ ebayAmazonCompareAutoRunEnabled: true });
    const firstRun = await runScheduledEbayAmazonComparison({ mode: 'MANUAL' });
    return { started: true, ruleConfig, firstRun };
  });

  app.post('/api/ebay-discovery/amazon-compare-auto-run/stop', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const ruleConfig = await patchRuleConfig({ ebayAmazonCompareAutoRunEnabled: false });
    const cancelledRuns = await cancelRunningAmazonComparisonAutoRuns('Amazon comparison auto-run stopped by user.');
    const releasedComparingRows = await releaseComparingEbayCandidates();
    return { stopped: true, deleted: false, cancelledRuns, releasedComparingRows, ruleConfig };
  });

  app.post('/api/ebay-discovery/amazon-compare-auto-run/delete', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const ruleConfig = await patchRuleConfig({
      ebayAmazonCompareAutoRunEnabled: false,
      ebayAmazonCompareAutoRunIntervalMinutes: defaultRuleConfig.ebayAmazonCompareAutoRunIntervalMinutes,
      ebayAmazonCompareAutoRunLimit: defaultRuleConfig.ebayAmazonCompareAutoRunLimit
    });
    const cancelledRuns = await cancelRunningAmazonComparisonAutoRuns('Amazon comparison auto-run deleted by user.');
    const releasedComparingRows = await releaseComparingEbayCandidates();
    return { stopped: true, deleted: true, cancelledRuns, releasedComparingRows, ruleConfig };
  });
}
