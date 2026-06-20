import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { getDashboardData, getDashboardDiscoveryCandidates, getPipelineSummary } from '../repositories/dashboardRepository.js';
import { defaultRuleConfig, getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { runLockedAmazonPriceMonitor } from '../services/amazonPriceMonitorScheduler.js';
import { runScoreBacktest } from '../services/backtesting.js';
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
  shippingLabelCost: z.number().min(0).optional(),
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
  amazonPriceCheckIntervalMinutes: z.number().int().positive().optional(),
  ebayDiscoveryAutoRunEnabled: z.boolean().optional(),
  ebayDiscoveryAutoRunIntervalMinutes: z.number().int().positive().max(1440).optional(),
  ebayDiscoveryAutoRunLimit: z.number().int().positive().max(25).optional(),
  ebayDiscoveryAutoCompareEnabled: z.boolean().optional(),
  ebayAmazonCompareAutoRunEnabled: z.boolean().optional(),
  ebayAmazonCompareAutoRunIntervalMinutes: z.number().int().positive().max(1440).optional(),
  ebayAmazonCompareAutoRunLimit: z.number().int().positive().max(25).optional(),
  ebayOrderSyncEnabled: z.boolean().optional(),
  ebayOrderSyncIntervalMinutes: z.number().int().positive().max(1440).optional(),
  ebayOrderSyncLookbackHours: z.number().int().positive().max(720).optional(),
  maxAutomationAttempts: z.number().int().min(1).max(20).optional(),
  verificationTtlMinutes: z.number().int().min(0).max(10080).optional(),
  repricingEnabled: z.boolean().optional(),
  repriceMaxIncreasePercent: z.number().min(0).max(1).optional(),
  inventorySyncEnabled: z.boolean().optional(),
  learningAdjustmentEnabled: z.boolean().optional()
});

const discoveryCandidatesQuerySchema = z.object({
  take: z.coerce.number().int().positive().max(2000).default(500)
});

const exportParamsSchema = z.object({
  entity: z.enum(['actions', 'candidates', 'listings', 'orders', 'profit-ledger', 'audit'])
});

const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  take: z.coerce.number().int().positive().max(5000).default(1000)
});

const auditQuerySchema = z.object({
  entityType: z.string().min(1).max(80).optional(),
  entityId: z.string().min(1).max(120).optional(),
  actor: z.string().min(1).max(80).optional(),
  action: z.string().min(1).max(80).optional(),
  take: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().min(1).optional()
});

type RuleConfigPatchValue = string | number | boolean | string[] | undefined;
type RuleConfigPatch = Record<string, RuleConfigPatchValue>;
type ExportEntity = 'actions' | 'candidates' | 'listings' | 'orders' | 'profit-ledger' | 'audit';
type HeaderReply = {
  type(value: string): HeaderReply;
  header(name: string, value: string): HeaderReply;
  send(payload: unknown): unknown;
};

type EbayAmazonComparisonRunRouteDelegate = {
  count(args?: unknown): Promise<number>;
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
  if (existing) return prisma.ruleConfig.update({ where: { id: existing.id }, data });
  // No active config yet: upsert by the unique name so two concurrent first-time saves
  // can't both create and collide on the primary key (P2002).
  return prisma.ruleConfig.upsert({
    where: { name: 'default' },
    update: { active: true, ...data },
    create: { id: 'default-rule-config', name: 'default', active: true, ...data }
  });
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

const csvValue = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR makes
  // Excel/Sheets evaluate the cell as a formula. Prefix with a single quote.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0] ?? {});
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))
  ].join('\n');
}

async function exportRows(entity: ExportEntity, take: number): Promise<Array<Record<string, unknown>>> {
  if (entity === 'actions') {
    return prisma.actionItem.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take,
      select: { id: true, type: true, status: true, priority: true, reason: true, createdBy: true, reviewedBy: true, createdAt: true, updatedAt: true }
    }) as Promise<Array<Record<string, unknown>>>;
  }
  if (entity === 'candidates') {
    return prisma.productCandidate.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, source: true, ebayTitle: true, ebayUrl: true, ebaySoldPrice: true, ebayCondition: true, opportunityScore: true, safetyStatus: true, createdAt: true }
    }) as Promise<Array<Record<string, unknown>>>;
  }
  if (entity === 'listings') {
    return prisma.ebayListing.findMany({
      orderBy: { updatedAt: 'desc' },
      take,
      select: { id: true, ebayItemId: true, ebayOfferId: true, listingStatus: true, listedPrice: true, quantity: true, title: true, createdAt: true, updatedAt: true }
    }) as Promise<Array<Record<string, unknown>>>;
  }
  if (entity === 'orders') {
    return prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, ebayOrderId: true, ebayListingId: true, buyerName: true, salePrice: true, orderStatus: true, fulfillmentStatus: true, amazonOrderStatus: true, createdAt: true, updatedAt: true }
    }) as Promise<Array<Record<string, unknown>>>;
  }
  if (entity === 'audit') {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, entityType: true, entityId: true, action: true, actor: true, createdAt: true }
    }) as Promise<Array<Record<string, unknown>>>;
  }
  return prisma.profitLedgerEntry.findMany({
    orderBy: { realizedAt: 'desc' },
    take,
    select: { id: true, productCandidateId: true, ebayListingId: true, orderId: true, revenue: true, sourceCost: true, marketplaceFees: true, shippingCost: true, refunds: true, netProfit: true, currency: true, realizedAt: true }
  }) as Promise<Array<Record<string, unknown>>>;
}

async function dashboardAlerts(): Promise<Array<Record<string, unknown>>> {
  const staleRunCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const staleLockCutoff = new Date();
  const [
    failedAutomationRuns,
    reviewAutomationRuns,
    staleAutomationRuns,
    failedComparisonRuns,
    staleLocks,
    pendingVerifyActions,
    pendingBuyActions
  ] = await Promise.all([
    prisma.automationRun.count({ where: { status: 'FAILED', updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.automationRun.count({ where: { status: 'REVIEW_REQUIRED' } }),
    prisma.automationRun.count({ where: { status: 'RUNNING', updatedAt: { lte: staleRunCutoff } } }),
    routeDb.ebayAmazonComparisonRun.count({ where: { status: 'FAILED' } }),
    prisma.schedulerLock.count({ where: { leasedUntil: { lte: staleLockCutoff } } }),
    prisma.actionItem.count({ where: { type: 'VERIFY', status: 'PENDING' } }),
    prisma.actionItem.count({ where: { type: 'BUY', status: 'PENDING' } })
  ]);

  const alerts = [
    failedAutomationRuns > 0 ? { severity: 'high', code: 'AUTOMATION_FAILURES', message: `${failedAutomationRuns} automation runs failed in the last 24 hours.` } : undefined,
    reviewAutomationRuns > 0 ? { severity: 'medium', code: 'AUTOMATION_REVIEW_REQUIRED', message: `${reviewAutomationRuns} automation runs need review.` } : undefined,
    staleAutomationRuns > 0 ? { severity: 'high', code: 'STALE_AUTOMATION_RUNS', message: `${staleAutomationRuns} automation runs have been running for more than 30 minutes.` } : undefined,
    failedComparisonRuns > 0 ? { severity: 'medium', code: 'COMPARISON_RUN_HISTORY', message: `${failedComparisonRuns} Amazon comparison runs are recorded; check recent failures and token waits in Automation.` } : undefined,
    staleLocks > 0 ? { severity: 'low', code: 'EXPIRED_SCHEDULER_LOCKS', message: `${staleLocks} scheduler locks are expired and available for takeover.` } : undefined,
    pendingVerifyActions > 0 ? { severity: 'medium', code: 'PENDING_VERIFICATION', message: `${pendingVerifyActions} listing verifications are waiting.` } : undefined,
    pendingBuyActions > 0 ? { severity: 'high', code: 'PENDING_BUY_ACTIONS', message: `${pendingBuyActions} purchase actions are waiting.` } : undefined
  ];
  return alerts.flatMap((alert) => alert ? [alert] : []);
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

  app.get('/api/alerts', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return { alerts: await dashboardAlerts() };
  });

  app.get('/api/export/:entity', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const params = exportParamsSchema.safeParse(request.params);
    const query = exportQuerySchema.safeParse(request.query ?? {});
    if (!params.success || !query.success) {
      return reply.status(400).send({
        error: 'Invalid export request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          query: query.success ? undefined : query.error.flatten()
        }
      });
    }

    const rows = await exportRows(params.data.entity, query.data.take);
    if (query.data.format === 'csv') {
      return (reply as unknown as HeaderReply)
        .type('text/csv')
        .header('content-disposition', `attachment; filename="buysell-${params.data.entity}.csv"`)
        .send(rowsToCsv(rows));
    }
    return { entity: params.data.entity, rows };
  });

  app.get('/api/audit', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = auditQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid audit query', details: parsed.error.flatten() });
    }
    const { entityType, entityId, actor, action, take, cursor } = parsed.data;
    const where = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actor ? { actor } : {}),
      ...(action ? { action } : {})
    };
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return { entries: page, nextCursor: hasMore ? page[page.length - 1]?.id : null };
  });

  app.get('/api/backtest/score', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return runScoreBacktest(prisma);
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
      'shippingLabelCost',
      'paymentFixedFee',
      'defaultPromotedListingFeeRate',
      'returnReserveRate',
      'cancellationReserveRate',
      'marketplaceRiskBuffer',
      'minimumSellThroughRate',
      'maximumCompetitionRatio',
      'maxDailyPurchaseAmountUsd',
      'maxAmazonCostUsd',
      'repriceMaxIncreasePercent'
    ]);
    const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, typeof value === 'number' && decimalKeys.has(key) ? String(value) : value])) as RuleConfigPatch;
    const ruleConfig = await patchRuleConfig(data);
    // Audit operationally-sensitive settings changes (which fields changed, by whom).
    await prisma.auditLog.create({
      data: {
        entityType: 'RuleConfig',
        entityId: 'default',
        action: 'RULECONFIG_UPDATED',
        actor: 'dashboard',
        afterJson: { changedKeys: Object.keys(parsed.data), values: parsed.data }
      }
    }).catch(() => undefined);
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
