import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { getDashboardData } from '../repositories/dashboardRepository.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { runAmazonPriceMonitor } from '../services/amazonPriceMonitor.js';

const settingsSchema = z.object({
  minimumProfitUsd: z.number().positive().optional(),
  minimumRoiPercent: z.number().positive().optional(),
  minimumMatchConfidence: z.number().min(0).max(1).optional(),
  estimatedSalesTaxRate: z.number().min(0).max(1).optional(),
  returnRiskBuffer: z.number().min(0).optional(),
  priceChangeBuffer: z.number().min(0).optional(),
  maxDailyListings: z.number().int().positive().optional(),
  maxDailyPurchaseAmountUsd: z.number().positive().optional(),
  safeMode: z.boolean().optional(),
  maxAmazonCostUsd: z.number().positive().optional(),
  minimumOpportunityScore: z.number().int().min(0).max(100).optional(),
  blockedCategories: z.array(z.string()).optional(),
  blockedKeywords: z.array(z.string()).optional(),
  allowedCategories: z.array(z.string()).optional(),
  amazonPriceCheckIntervalMinutes: z.number().int().positive().optional()
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
    const decimalKeys = new Set(['minimumProfitUsd', 'minimumRoiPercent', 'minimumMatchConfidence', 'estimatedSalesTaxRate', 'returnRiskBuffer', 'priceChangeBuffer', 'maxDailyPurchaseAmountUsd', 'maxAmazonCostUsd']);
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
}
