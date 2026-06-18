import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { getDashboardData } from '../repositories/dashboardRepository.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { runAmazonPriceMonitor } from '../services/amazonPriceMonitor.js';
import { runScheduledEbayAmazonComparison, runScheduledEbayDiscovery } from '../services/ebayDiscoveryScheduler.js';

const settingsSchema = z.object({
  minimumProfitUsd: z.number().positive().optional(),
  minimumRoiPercent: z.number().positive().optional(),
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

  app.get('/api/settings', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return getActiveRuleConfig(prisma);
  });

  app.patch('/api/settings', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid settings payload', details: parsed.error.flatten() });
    const existing = await prisma.ruleConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
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
    const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, typeof value === 'number' && decimalKeys.has(key) ? String(value) : value]));
    const ruleConfig = existing
      ? await prisma.ruleConfig.update({ where: { id: existing.id }, data })
      : await prisma.ruleConfig.create({ data: { id: 'default-rule-config', name: 'default', active: true, ...data } });
    return { ruleConfig };
  });

  app.post('/api/monitor/amazon-prices/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return runAmazonPriceMonitor(prisma);
  });

  app.post('/api/ebay-discovery/auto-run/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return runScheduledEbayDiscovery();
  });

  app.post('/api/ebay-discovery/amazon-compare-auto-run/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return runScheduledEbayAmazonComparison({ mode: 'MANUAL' });
  });
}
