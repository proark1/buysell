import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { getKeepaTokenStatus, KeepaApiError, type KeepaTokenStatus } from '../clients/keepaClient.js';
import { SerpApiError } from '../clients/serpApiClient.js';
import { buildOpportunities } from '../pipeline/opportunityPipeline.js';
import { persistOpportunities } from '../repositories/opportunityRepository.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import type { ActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { amazonDiscoveryProfiles, discoveryProfiles, ebayDiscoveryProfiles, getDiscoveryProfile, rejectionStageForFlag } from '../services/discoveryPolicy.js';
import {
  buildAmazonDiscoveryCandidates,
  considerAmazonDiscoveryCandidate,
  compareAmazonDiscoveryCandidates,
  persistAmazonDiscoveryRun,
  type AmazonDiscoveryCandidateResult
} from '../services/amazonDiscovery.js';
import {
  buildEbayDiscoveryCandidates,
  compareEbayDiscoveryCandidates,
  considerEbayDiscoveryCandidate,
  loadExistingEbayDiscoveryKeys,
  persistEbayDiscoveryRun,
  type EbayDiscoveryCandidateResult
} from '../services/ebayDiscovery.js';
import {
  amazonDiscoveryMarkets,
  ebayComparisonPresets,
  resolveEbayComparisonSettings,
  type EbayComparisonSettings
} from '../services/marketplaces.js';
import { getSecret } from '../services/secrets.js';
import { recordApiUsage } from '../services/apiUsage.js';
import { withSchedulerLock } from '../services/schedulerLocks.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import type { ProductOpportunity } from '../domain/products.js';

const opportunityRequestSchema = z.object({
  query: z.string().min(2),
  limit: z.number().int().positive().max(25).optional(),
  persist: z.boolean().default(false),
  profileKey: z.string().optional(),
  safeMode: z.boolean().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxAmazonCostUsd: z.number().positive().optional()
});

const scanRequestSchema = z.object({
  profileKey: z.string().default('starter-safe'),
  query: z.string().min(2).optional(),
  limit: z.number().int().positive().max(25).optional(),
  persist: z.boolean().default(true),
  safeMode: z.boolean().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxAmazonCostUsd: z.number().positive().optional()
});

const ebayComparisonSettingsSchema = z.object({
  presetKey: z.string().optional(),
  minProfit: z.number().min(0).optional(),
  minRoiPercent: z.number().min(0).max(500).optional(),
  minMatchConfidencePercent: z.number().min(0).max(100).optional(),
  minOpportunityScore: z.number().int().min(0).max(100).optional(),
  ebayResultLimit: z.number().int().positive().max(50).optional(),
  soldOnly: z.boolean().optional(),
  completedOnly: z.boolean().optional(),
  buyingFormat: z.enum(['ANY', 'BIN', 'Auction', 'BO']).optional(),
  itemCondition: z.enum(['ANY', 'NEW', 'USED', 'OPEN_BOX']).optional(),
  preferredLocation: z.enum(['ANY', 'Domestic', 'Regional', 'Worldwide']).optional(),
  postalCode: z.string().max(20).optional()
}).optional();

const amazonDiscoveryRunRequestSchema = z.object({
  profileKey: z.string().default('starter-safe'),
  categoryKey: z.string().optional(),
  marketKey: z.string().optional(),
  query: z.string().min(2).optional(),
  limit: z.number().int().positive().max(100).optional(),
  mode: z.enum(['MANUAL', 'AUTO']).default('MANUAL'),
  autoCompare: z.boolean().default(false),
  compareLimit: z.number().int().positive().max(50).optional(),
  ebayComparison: ebayComparisonSettingsSchema,
  safeMode: z.boolean().optional(),
  minAmazonScore: z.number().int().min(0).max(100).optional(),
  maxAmazonCostUsd: z.number().positive().optional(),
  minPriceDropPercent: z.number().min(0).max(100).optional()
});

const amazonDiscoverySelectRequestSchema = z.object({
  candidateIds: z.array(z.string()).min(1),
  selected: z.boolean().default(true)
});

const amazonDiscoveryCompareRequestSchema = z.object({
  runId: z.string().optional(),
  candidateIds: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(50).optional(),
  marketKey: z.string().optional(),
  ebayComparison: ebayComparisonSettingsSchema,
  force: z.boolean().default(false)
}).refine((value: { runId?: string; candidateIds?: string[] }) => value.runId || (value.candidateIds && value.candidateIds.length > 0), {
  message: 'runId or candidateIds is required'
});

const amazonDiscoveryConsiderRequestSchema = z.object({
  candidateId: z.string(),
  note: z.string().max(500).optional()
});

const comparisonThresholdsSchema = z.object({
  minProfit: z.number().min(0).optional(),
  minRoiPercent: z.number().min(0).max(500).optional(),
  minMatchConfidencePercent: z.number().min(0).max(100).optional(),
  minOpportunityScore: z.number().int().min(0).max(100).optional()
}).optional();

const ebayDiscoveryRunRequestSchema = z.object({
  profileKey: z.string().default('starter-safe'),
  categoryKey: z.string().optional(),
  marketKey: z.string().optional(),
  query: z.string().min(2).optional(),
  categoryId: z.string().max(40).optional(),
  limit: z.number().int().positive().max(100).optional(),
  mode: z.enum(['MANUAL', 'AUTO']).default('MANUAL'),
  autoCompare: z.boolean().default(false),
  compareLimit: z.number().int().positive().max(50).optional(),
  amazonMatchLimit: z.number().int().positive().max(10).optional(),
  comparison: comparisonThresholdsSchema,
  safeMode: z.boolean().optional(),
  minEbayScore: z.number().int().min(0).max(100).optional(),
  minSoldPrice: z.number().min(0).optional(),
  maxSoldPrice: z.number().min(0).optional(),
  soldOnly: z.boolean().default(true),
  completedOnly: z.boolean().default(true),
  buyingFormat: z.enum(['ANY', 'BIN', 'Auction', 'BO']).default('BIN'),
  itemCondition: z.enum(['ANY', 'NEW', 'USED', 'OPEN_BOX']).default('NEW'),
  preferredLocation: z.enum(['ANY', 'Domestic', 'Regional', 'Worldwide']).default('Domestic'),
  postalCode: z.string().max(20).optional(),
  queryBreadth: z.enum(['FOCUSED', 'BALANCED', 'WIDE']).default('BALANCED'),
  skipExistingProducts: z.boolean().default(true)
});

const ebayDiscoverySelectRequestSchema = z.object({
  candidateIds: z.array(z.string()).min(1),
  selected: z.boolean().default(true)
});

const ebayDiscoveryCompareRequestSchema = z.object({
  runId: z.string().optional(),
  candidateIds: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(50).optional(),
  marketKey: z.string().optional(),
  amazonMatchLimit: z.number().int().positive().max(10).optional(),
  comparison: comparisonThresholdsSchema,
  force: z.boolean().default(false)
}).refine((value: { runId?: string; candidateIds?: string[] }) => value.runId || (value.candidateIds && value.candidateIds.length > 0), {
  message: 'runId or candidateIds is required'
});

const ebayDiscoveryConsiderRequestSchema = z.object({
  candidateId: z.string(),
  note: z.string().max(500).optional()
});

type EbayComparisonSettingsBody = {
  presetKey?: string;
  minProfit?: number;
  minRoiPercent?: number;
  minMatchConfidencePercent?: number;
  minOpportunityScore?: number;
  ebayResultLimit?: number;
  soldOnly?: boolean;
  completedOnly?: boolean;
  buyingFormat?: 'ANY' | 'BIN' | 'Auction' | 'BO';
  itemCondition?: 'ANY' | 'NEW' | 'USED' | 'OPEN_BOX';
  preferredLocation?: 'ANY' | 'Domestic' | 'Regional' | 'Worldwide';
  postalCode?: string;
} | undefined;

type ComparisonThresholdsBody = {
  minProfit?: number;
  minRoiPercent?: number;
  minMatchConfidencePercent?: number;
  minOpportunityScore?: number;
} | undefined;

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function keepaErrorResponse(error: KeepaApiError): {
  statusCode: number;
  body: Record<string, unknown>;
} {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(error.body);
  } catch {
    parsedBody = undefined;
  }

  const keepaError = recordValue(parsedBody, 'error');
  const message = typeof recordValue(keepaError, 'message') === 'string'
    ? String(recordValue(keepaError, 'message'))
    : undefined;
  const refillIn = recordValue(parsedBody, 'refillIn');
  const retryAfterSeconds = typeof refillIn === 'number' && refillIn > 0 ? Math.ceil(refillIn / 1000) : undefined;
  const upstreamStatusCodes = new Set([401, 402, 403, 429]);
  const statusCode = upstreamStatusCodes.has(error.status) ? error.status : 502;
  const rateLimitMessage = retryAfterSeconds
    ? `Keepa rate limit reached. Try again in ${retryAfterSeconds} seconds.`
    : 'Keepa rate limit reached. Try again after your token budget refills.';

  return {
    statusCode,
    body: {
      error: error.status === 429 ? rateLimitMessage : 'Keepa rejected the Amazon discovery request',
      status: error.status,
      details: message ?? error.body.trim().slice(0, 300),
      retryAfterSeconds,
      tokensLeft: recordValue(parsedBody, 'tokensLeft'),
      refillInMs: refillIn
    }
  };
}

function serpApiErrorResponse(error: SerpApiError): {
  statusCode: number;
  body: Record<string, unknown>;
} {
  const upstreamStatusCodes = new Set([401, 402, 403, 429]);
  return {
    statusCode: upstreamStatusCodes.has(error.status) ? error.status : 502,
    body: {
      error: 'SerpAPI rejected the eBay comparison request',
      status: error.status,
      details: error.body.trim().slice(0, 300)
    }
  };
}

function estimatedAmazonDiscoveryTokens(data: {
  profileKey?: string;
  limit?: number;
}): number {
  const profile = amazonDiscoveryProfiles.find((item) => item.key === data.profileKey) ?? amazonDiscoveryProfiles[0];
  return Math.min(Math.max(data.limit ?? profile.defaultLimit, 1), 100);
}

function estimatedEbayDiscoveryTokens(data: {
  profileKey?: string;
  compareLimit?: number;
  amazonMatchLimit?: number;
}): number {
  const profile = ebayDiscoveryProfiles.find((item) => item.key === data.profileKey) ?? ebayDiscoveryProfiles[0];
  const compareLimit = data.compareLimit ?? profile.compareLimit;
  const amazonMatchLimit = data.amazonMatchLimit ?? 3;
  return Math.min(Math.max(compareLimit * Math.max(amazonMatchLimit, 1), 1), 100);
}

function lowKeepaTokenResponse(tokenStatus: KeepaTokenStatus, requestedTokens: number): {
  statusCode: number;
  body: Record<string, unknown>;
} {
  const retryAfterSeconds = tokenStatus.retryAfterSeconds ?? (tokenStatus.refillIn && tokenStatus.refillIn > 0 ? Math.ceil(tokenStatus.refillIn / 1000) : undefined);
  return {
    statusCode: 429,
    body: {
      error: retryAfterSeconds
        ? `Keepa token budget is too low. Try again in ${retryAfterSeconds} seconds or lower Amazon Products To Check.`
        : 'Keepa token budget is too low. Lower Amazon Products To Check or wait for more tokens.',
      status: 429,
      details: `Keepa has ${tokenStatus.tokensLeft} tokens available; this scan asks for about ${requestedTokens}.`,
      retryAfterSeconds,
      tokensLeft: tokenStatus.tokensLeft,
      refillInMs: tokenStatus.refillIn,
      refillRate: tokenStatus.refillRate,
      requestedTokens
    }
  };
}

function sanitizePersistedRun(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    candidates: Array.isArray(record.candidates)
      ? record.candidates.map((candidate) => {
        const rest = { ...(candidate as Record<string, unknown>) };
        delete rest.rawKeepaJson;
        delete rest.rawSerpapiJson;
        return rest;
      })
      : record.candidates
  };
}

function sanitizeAmazonDiscoveryCandidate(candidate: AmazonDiscoveryCandidateResult): AmazonDiscoveryCandidateResult {
  const amazon = { ...candidate.amazon };
  delete amazon.raw;
  return { ...candidate, amazon };
}

function sanitizeEbayDiscoveryCandidate(candidate: EbayDiscoveryCandidateResult): EbayDiscoveryCandidateResult {
  const ebay = { ...candidate.ebay };
  delete ebay.raw;
  return { ...candidate, ebay };
}

function sanitizeOpportunity(opportunity: ProductOpportunity): ProductOpportunity {
  const ebay = { ...opportunity.ebay };
  const amazon = { ...opportunity.amazon };
  delete ebay.raw;
  delete amazon.raw;
  return { ...opportunity, ebay, amazon };
}

function buildAmazonRejectionBreakdown(candidates: AmazonDiscoveryCandidateResult[]): Array<{
  reason: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const reasons = candidate.rejectionReasons.length > 0
      ? candidate.rejectionReasons
      : candidate.safety.riskFlags.length > 0
        ? candidate.safety.riskFlags
        : ['Below Amazon Scout filters'];
    for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function buildEbayRejectionBreakdown(candidates: EbayDiscoveryCandidateResult[]): Array<{
  reason: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const reasons = candidate.rejectionReasons.length > 0
      ? candidate.rejectionReasons
      : candidate.safety.riskFlags.length > 0
        ? candidate.safety.riskFlags
        : ['Below eBay Discovery filters'];
    for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function buildRejectionStageBreakdown(candidates: Array<{ safety: { riskFlags: string[] } }>): Array<{
  stage: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const stages = candidate.safety.riskFlags.length > 0
      ? [...new Set(candidate.safety.riskFlags.map(rejectionStageForFlag))]
      : ['SCORING'];
    for (const stage of stages) counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
}

function countRejectedByStages(candidates: Array<{ safety: { riskFlags: string[] } }>, stages: string[]): number {
  const stageSet = new Set(stages);
  return candidates.filter((candidate) => {
    const candidateStages = candidate.safety.riskFlags.map(rejectionStageForFlag);
    return candidateStages.some((stage) => stageSet.has(stage));
  }).length;
}

function normalizeEbayComparisonSettings(input: EbayComparisonSettingsBody): EbayComparisonSettings {
  return resolveEbayComparisonSettings({
    presetKey: input?.presetKey,
    minimumProfit: input?.minProfit,
    minimumRoiPercent: input?.minRoiPercent,
    minimumMatchConfidence: input?.minMatchConfidencePercent === undefined ? undefined : input.minMatchConfidencePercent / 100,
    minimumOpportunityScore: input?.minOpportunityScore,
    ebayResultLimit: input?.ebayResultLimit,
    soldOnly: input?.soldOnly,
    completedOnly: input?.completedOnly,
    buyingFormat: input?.buyingFormat,
    itemCondition: input?.itemCondition,
    preferredLocation: input?.preferredLocation,
    postalCode: input?.postalCode?.trim() || undefined
  });
}

function ruleConfigWithEbaySettings(ruleConfig: ActiveRuleConfig, settings: EbayComparisonSettings): ActiveRuleConfig {
  return {
    ...ruleConfig,
    thresholds: {
      ...ruleConfig.thresholds,
      minimumProfitUsd: settings.minimumProfit,
      minimumRoiPercent: settings.minimumRoiPercent,
      minimumMatchConfidence: settings.minimumMatchConfidence
    },
    minimumOpportunityScore: settings.minimumOpportunityScore
  };
}

function ruleConfigWithComparisonThresholds(ruleConfig: ActiveRuleConfig, input: ComparisonThresholdsBody): ActiveRuleConfig {
  return {
    ...ruleConfig,
    thresholds: {
      ...ruleConfig.thresholds,
      minimumProfitUsd: input?.minProfit ?? ruleConfig.thresholds.minimumProfitUsd,
      minimumRoiPercent: input?.minRoiPercent ?? ruleConfig.thresholds.minimumRoiPercent,
      minimumMatchConfidence: input?.minMatchConfidencePercent === undefined
        ? ruleConfig.thresholds.minimumMatchConfidence
        : input.minMatchConfidencePercent / 100
    },
    minimumOpportunityScore: input?.minOpportunityScore ?? ruleConfig.minimumOpportunityScore
  };
}

// Shared with the scheduler so manual and automatic Amazon comparisons never run
// concurrently and double-spend Keepa tokens on the same candidates.
const COMPARISON_LOCK_NAME = 'ebay-amazon-comparison-auto-run';
const COMPARISON_LOCK_TTL_MS = 6 * 60 * 1000;

export async function registerOpportunityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/opportunities/profiles', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return { profiles: discoveryProfiles };
  });
  app.get('/amazon-discovery/profiles', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return { profiles: amazonDiscoveryProfiles, markets: amazonDiscoveryMarkets, ebayComparisonPresets };
  });
  app.get('/ebay-discovery/profiles', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    return { profiles: ebayDiscoveryProfiles, markets: amazonDiscoveryMarkets, comparisonPresets: ebayComparisonPresets };
  });
  app.get('/amazon-discovery/token-status', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
    if (!keepaApiKey) {
      return reply.status(503).send({ error: 'KEEPA_API_KEY is required for Keepa token status' });
    }

    try {
      return await getKeepaTokenStatus(keepaApiKey);
    } catch (error) {
      if (error instanceof KeepaApiError) {
        const keepaError = keepaErrorResponse(error);
        return reply.status(keepaError.statusCode).send(keepaError.body);
      }
      throw error;
    }
  });

  app.post('/opportunities/search', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = opportunityRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid opportunity search request', details: parsed.error.flatten() });
    }

    const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
    const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
    if (!serpApiKey || !keepaApiKey) {
      return reply.status(503).send({ error: 'SERPAPI_API_KEY and KEEPA_API_KEY are required for opportunity search' });
    }

    if (parsed.data.persist && !env.DATABASE_URL) {
      return reply.status(503).send({ error: 'DATABASE_URL is required when persist is true' });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const profile = getDiscoveryProfile(parsed.data.profileKey);
    const opportunities = await buildOpportunities({
      query: parsed.data.query,
      limit: parsed.data.limit,
      discoveryProfile: profile.key,
      serpApiKey,
      keepaApiKey,
      thresholds: ruleConfig.thresholds,
      minimumOpportunityScore: parsed.data.minScore ?? ruleConfig.minimumOpportunityScore,
      maxAmazonCostUsd: parsed.data.maxAmazonCostUsd ?? ruleConfig.maxAmazonCostUsd,
      estimatedSalesTaxRate: ruleConfig.estimatedSalesTaxRate,
      returnRiskBuffer: ruleConfig.returnRiskBuffer,
      priceChangeBuffer: ruleConfig.priceChangeBuffer,
      sourceShippingCost: ruleConfig.sourceShippingCost,
      packagingCost: ruleConfig.packagingCost,
      paymentFixedFee: ruleConfig.paymentFixedFee,
      promotedListingFeeRate: ruleConfig.defaultPromotedListingFeeRate,
      returnReserveRate: ruleConfig.returnReserveRate,
      cancellationReserveRate: ruleConfig.cancellationReserveRate,
      marketplaceRiskBuffer: ruleConfig.marketplaceRiskBuffer,
      minimumSellThroughRate: ruleConfig.minimumSellThroughRate,
      maximumCompetitionRatio: ruleConfig.maximumCompetitionRatio,
      safeMode: parsed.data.safeMode ?? ruleConfig.safeMode,
      blockedBrands: ruleConfig.blockedBrands,
      blockedCategories: ruleConfig.blockedCategories,
      blockedKeywords: ruleConfig.blockedKeywords
    });

    const accepted = opportunities.filter((opportunity) => opportunity.decision.decision !== 'REJECT');
    const persisted = parsed.data.persist ? await persistOpportunities(prisma, accepted, { discoveryProfile: profile.key }) : [];

    return {
      opportunities,
      summary: {
        scanned: opportunities.length,
        accepted: accepted.length,
        rejected: opportunities.length - accepted.length,
        profile: profile.key
      },
      persisted
    };
  });

  app.post('/opportunities/scan', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = scanRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid discovery scan request', details: parsed.error.flatten() });
    }

    if (!env.DATABASE_URL) {
      return reply.status(503).send({ error: 'DATABASE_URL is required for guided discovery scans' });
    }

    const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
    const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
    if (!serpApiKey || !keepaApiKey) {
      return reply.status(503).send({ error: 'SERPAPI_API_KEY and KEEPA_API_KEY are required for guided discovery scans' });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const profile = getDiscoveryProfile(parsed.data.profileKey);
    const query = parsed.data.query?.trim();
    if (profile.key === 'custom' && !query) {
      return reply.status(400).send({ error: 'Custom scans require a query' });
    }

    const queries = query
      ? [query, ...profile.seedQueries.filter((seed) => seed.toLowerCase() !== query.toLowerCase())]
      : profile.seedQueries;
    const limit = parsed.data.limit ?? profile.defaultLimit;
    const minimumOpportunityScore = parsed.data.minScore ?? ruleConfig.minimumOpportunityScore ?? profile.minimumOpportunityScore;
    const maxAmazonCostUsd = parsed.data.maxAmazonCostUsd ?? ruleConfig.maxAmazonCostUsd ?? profile.maxAmazonCostUsd;
    const safeMode = parsed.data.safeMode ?? ruleConfig.safeMode;
    const filters = {
      profileKey: profile.key,
      profileLabel: profile.label,
      query,
      queries,
      limit,
      safeMode,
      minimumOpportunityScore,
      maxAmazonCostUsd,
      minimumProfitUsd: ruleConfig.thresholds.minimumProfitUsd,
      minimumRoiPercent: ruleConfig.thresholds.minimumRoiPercent
    };

    const scanRun = await prisma.discoveryScanRun.create({
      data: {
        profileKey: profile.key,
        query,
        filtersJson: filters
      }
    });

    try {
      const opportunities = await buildOpportunities({
        query: query ?? profile.seedQueries[0] ?? profile.label,
        queries,
        limit,
        discoveryProfile: profile.key,
        serpApiKey,
        keepaApiKey,
        thresholds: {
          ...ruleConfig.thresholds,
          minimumProfitUsd: Math.max(ruleConfig.thresholds.minimumProfitUsd, profile.minimumProfitUsd),
          minimumRoiPercent: Math.max(ruleConfig.thresholds.minimumRoiPercent, profile.minimumRoiPercent)
        },
        minimumOpportunityScore,
        maxAmazonCostUsd,
        estimatedSalesTaxRate: ruleConfig.estimatedSalesTaxRate,
        returnRiskBuffer: ruleConfig.returnRiskBuffer,
        priceChangeBuffer: ruleConfig.priceChangeBuffer,
        sourceShippingCost: ruleConfig.sourceShippingCost,
        packagingCost: ruleConfig.packagingCost,
        paymentFixedFee: ruleConfig.paymentFixedFee,
        promotedListingFeeRate: ruleConfig.defaultPromotedListingFeeRate,
        returnReserveRate: ruleConfig.returnReserveRate,
        cancellationReserveRate: ruleConfig.cancellationReserveRate,
        marketplaceRiskBuffer: ruleConfig.marketplaceRiskBuffer,
        minimumSellThroughRate: ruleConfig.minimumSellThroughRate,
        maximumCompetitionRatio: ruleConfig.maximumCompetitionRatio,
        safeMode,
        blockedBrands: ruleConfig.blockedBrands,
        blockedCategories: ruleConfig.blockedCategories,
        blockedKeywords: ruleConfig.blockedKeywords
      });

      const accepted = opportunities.filter((opportunity) => opportunity.decision.decision !== 'REJECT');
      const rejected = opportunities.filter((opportunity) => opportunity.decision.decision === 'REJECT');
      const persisted = parsed.data.persist
        ? await persistOpportunities(prisma, accepted, { discoveryRunId: scanRun.id, discoveryProfile: profile.key })
        : [];

      const completed = await prisma.discoveryScanRun.update({
        where: { id: scanRun.id },
        data: {
          status: 'COMPLETED',
          scannedCount: opportunities.length,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
          completedAt: new Date()
        }
      });

      return {
        scanRun: completed,
        profile,
        summary: {
          scanned: opportunities.length,
          accepted: accepted.length,
          rejected: rejected.length,
          persisted: persisted.length
        },
        opportunities: accepted,
        rejectedPreview: rejected.slice(0, 5),
        persisted
      };
    } catch (error) {
      await prisma.discoveryScanRun.update({
        where: { id: scanRun.id },
        data: {
          status: 'ERROR',
          error: error instanceof Error ? error.message : 'Discovery scan failed',
          completedAt: new Date()
        }
      });
      throw error;
    }
  });

  app.post('/amazon-discovery/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = amazonDiscoveryRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid Amazon discovery request', details: parsed.error.flatten() });
    }

    if (!env.DATABASE_URL) {
      return reply.status(503).send({ error: 'DATABASE_URL is required for Amazon discovery scans' });
    }

    const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
    if (!keepaApiKey) {
      return reply.status(503).send({ error: 'KEEPA_API_KEY is required for Amazon discovery scans' });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const ebayComparisonSettings = normalizeEbayComparisonSettings(parsed.data.ebayComparison);
    const comparisonRuleConfig = ruleConfigWithEbaySettings(ruleConfig, ebayComparisonSettings);
    const effectiveMode = parsed.data.autoCompare ? 'AUTO' : parsed.data.mode;
    let result: Awaited<ReturnType<typeof buildAmazonDiscoveryCandidates>>;
    let persistedRun: Awaited<ReturnType<typeof persistAmazonDiscoveryRun>>;
    try {
      const requestedTokens = estimatedAmazonDiscoveryTokens(parsed.data);
      const tokenStatus = await getKeepaTokenStatus(keepaApiKey);
      if (tokenStatus.tokensLeft < requestedTokens) {
        const lowTokenResponse = lowKeepaTokenResponse(tokenStatus, requestedTokens);
        return reply.status(lowTokenResponse.statusCode).send(lowTokenResponse.body);
      }

      result = await buildAmazonDiscoveryCandidates({
        keepaApiKey,
        ruleConfig,
        profileKey: parsed.data.profileKey,
        categoryKey: parsed.data.categoryKey,
        marketKey: parsed.data.marketKey,
        query: parsed.data.query,
        limit: parsed.data.limit,
        mode: effectiveMode,
        safeMode: parsed.data.safeMode,
        minimumAmazonScore: parsed.data.minAmazonScore,
        maxAmazonCostUsd: parsed.data.maxAmazonCostUsd,
        minPriceDropPercent: parsed.data.minPriceDropPercent
      });
      persistedRun = await persistAmazonDiscoveryRun(prisma, {
        keepaApiKey,
        ruleConfig,
        profileKey: parsed.data.profileKey,
        categoryKey: parsed.data.categoryKey,
        marketKey: parsed.data.marketKey,
        query: parsed.data.query,
        limit: parsed.data.limit,
        mode: effectiveMode,
        safeMode: parsed.data.safeMode,
        minimumAmazonScore: parsed.data.minAmazonScore,
        maxAmazonCostUsd: parsed.data.maxAmazonCostUsd,
        minPriceDropPercent: parsed.data.minPriceDropPercent
      }, result);
    } catch (error) {
      if (error instanceof KeepaApiError) {
        const keepaError = keepaErrorResponse(error);
        return reply.status(keepaError.statusCode).send(keepaError.body);
      }
      app.log.error({ error }, 'Amazon discovery run failed');
      return reply.status(500).send({
        error: 'Amazon Scout failed while saving results',
        details: error instanceof Error ? error.message.slice(0, 500) : 'Unexpected Amazon Scout persistence error'
      });
    }

    let comparison;
    if (parsed.data.autoCompare || parsed.data.mode === 'AUTO') {
      const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
      if (!serpApiKey) {
        return reply.status(503).send({ error: 'SERPAPI_API_KEY is required for automatic eBay comparison' });
      }
      const runId = typeof persistedRun === 'object' && persistedRun && 'id' in persistedRun ? String(persistedRun.id) : undefined;
      if (runId) {
        try {
          comparison = await compareAmazonDiscoveryCandidates({
            db: prisma,
            serpApiKey,
            ruleConfig: comparisonRuleConfig,
            runId,
            limit: parsed.data.compareLimit,
            marketKey: parsed.data.marketKey,
            comparisonSettings: ebayComparisonSettings
          });
        } catch (error) {
          if (error instanceof SerpApiError) {
            const serpApiError = serpApiErrorResponse(error);
            return reply.status(serpApiError.statusCode).send(serpApiError.body);
          }
          throw error;
        }
      }
    }

    return {
      run: sanitizePersistedRun(persistedRun),
      profile: result.profile,
      category: result.category,
      summary: {
        scanned: result.candidates.length + result.rejected.length,
        accepted: result.candidates.length,
        rejected: result.rejected.length,
        sourceRejected: countRejectedByStages(result.rejected, ['SOURCE_DATA', 'SOURCE_FORMAT']),
        safetyRejected: countRejectedByStages(result.rejected, ['SAFETY']),
        compared: comparison?.compared ?? 0,
        opportunities: comparison?.opportunities.length ?? 0,
        manualReviews: comparison?.manualReviews.length ?? 0
      },
      rejected: result.rejected.map(sanitizeAmazonDiscoveryCandidate),
      rejectedPreview: result.rejected.slice(0, 5).map(sanitizeAmazonDiscoveryCandidate),
      rejectionBreakdown: buildAmazonRejectionBreakdown(result.rejected),
      rejectionStageBreakdown: buildRejectionStageBreakdown(result.rejected),
      comparison: comparison
        ? {
          ...comparison,
          opportunities: comparison.opportunities.map(sanitizeOpportunity),
          manualReviews: comparison.manualReviews.map(sanitizeOpportunity),
          rejected: comparison.rejected.map(sanitizeOpportunity)
        }
        : undefined
    };
  });

  app.post('/amazon-discovery/select', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = amazonDiscoverySelectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid Amazon discovery selection request', details: parsed.error.flatten() });
    }

    await prisma.amazonDiscoveryCandidate.updateMany({
      where: { id: { in: parsed.data.candidateIds } },
      data: { selected: parsed.data.selected }
    });
    return { selected: parsed.data.selected, count: parsed.data.candidateIds.length };
  });

  app.post('/amazon-discovery/compare', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = amazonDiscoveryCompareRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid Amazon discovery comparison request', details: parsed.error.flatten() });
    }

    const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
    if (!serpApiKey) {
      return reply.status(503).send({ error: 'SERPAPI_API_KEY is required for eBay comparison' });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const ebayComparisonSettings = normalizeEbayComparisonSettings(parsed.data.ebayComparison);
    const comparisonRuleConfig = ruleConfigWithEbaySettings(ruleConfig, ebayComparisonSettings);
    let comparison: Awaited<ReturnType<typeof compareAmazonDiscoveryCandidates>>;
    try {
      comparison = await compareAmazonDiscoveryCandidates({
        db: prisma,
        serpApiKey,
        ruleConfig: comparisonRuleConfig,
        runId: parsed.data.runId,
        candidateIds: parsed.data.candidateIds,
        limit: parsed.data.limit,
        marketKey: parsed.data.marketKey,
        comparisonSettings: ebayComparisonSettings,
        force: parsed.data.force
      });
    } catch (error) {
      if (error instanceof SerpApiError) {
        const serpApiError = serpApiErrorResponse(error);
        return reply.status(serpApiError.statusCode).send(serpApiError.body);
      }
      throw error;
    }

    return comparison;
  });

  app.post('/amazon-discovery/consider', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = amazonDiscoveryConsiderRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid Amazon discovery review request', details: parsed.error.flatten() });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const result = await considerAmazonDiscoveryCandidate({
      db: prisma,
      candidateId: parsed.data.candidateId,
      note: parsed.data.note,
      ruleConfig
    });
    return result;
  });

  app.post('/ebay-discovery/run', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = ebayDiscoveryRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid eBay discovery request', details: parsed.error.flatten() });
    }

    if (!env.DATABASE_URL) {
      return reply.status(503).send({ error: 'DATABASE_URL is required for eBay discovery scans' });
    }

    const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
    if (!serpApiKey) {
      return reply.status(503).send({ error: 'SERPAPI_API_KEY is required for eBay discovery scans' });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const comparisonRuleConfig = ruleConfigWithComparisonThresholds(ruleConfig, parsed.data.comparison);
    const effectiveMode = parsed.data.autoCompare ? 'AUTO' : parsed.data.mode;
    const existingKeys = parsed.data.skipExistingProducts
      ? await loadExistingEbayDiscoveryKeys(prisma)
      : { productFamilyKeys: [], ebayItemIds: [] };
    let result: Awaited<ReturnType<typeof buildEbayDiscoveryCandidates>>;
    let persistedRun: Awaited<ReturnType<typeof persistEbayDiscoveryRun>>;
    try {
      result = await buildEbayDiscoveryCandidates({
        serpApiKey,
        ruleConfig,
        profileKey: parsed.data.profileKey,
        categoryKey: parsed.data.categoryKey,
        marketKey: parsed.data.marketKey,
        query: parsed.data.query,
        categoryId: parsed.data.categoryId,
        limit: parsed.data.limit,
        mode: effectiveMode,
        safeMode: parsed.data.safeMode,
        minimumEbayScore: parsed.data.minEbayScore,
        minSoldPrice: parsed.data.minSoldPrice,
        maxSoldPrice: parsed.data.maxSoldPrice,
        soldOnly: parsed.data.soldOnly,
        completedOnly: parsed.data.completedOnly,
        buyingFormat: parsed.data.buyingFormat,
        itemCondition: parsed.data.itemCondition,
        preferredLocation: parsed.data.preferredLocation,
        postalCode: parsed.data.postalCode,
        queryBreadth: parsed.data.queryBreadth,
        skipExistingProducts: parsed.data.skipExistingProducts,
        existingProductFamilyKeys: existingKeys.productFamilyKeys,
        existingEbayItemIds: existingKeys.ebayItemIds
      });
      persistedRun = await persistEbayDiscoveryRun(prisma, {
        serpApiKey,
        ruleConfig,
        profileKey: parsed.data.profileKey,
        categoryKey: parsed.data.categoryKey,
        marketKey: parsed.data.marketKey,
        query: parsed.data.query,
        categoryId: parsed.data.categoryId,
        limit: parsed.data.limit,
        mode: effectiveMode,
        safeMode: parsed.data.safeMode,
        minimumEbayScore: parsed.data.minEbayScore,
        minSoldPrice: parsed.data.minSoldPrice,
        maxSoldPrice: parsed.data.maxSoldPrice,
        soldOnly: parsed.data.soldOnly,
        completedOnly: parsed.data.completedOnly,
        buyingFormat: parsed.data.buyingFormat,
        itemCondition: parsed.data.itemCondition,
        preferredLocation: parsed.data.preferredLocation,
        postalCode: parsed.data.postalCode,
        queryBreadth: parsed.data.queryBreadth,
        skipExistingProducts: parsed.data.skipExistingProducts
      }, result);
    } catch (error) {
      if (error instanceof SerpApiError) {
        const serpApiError = serpApiErrorResponse(error);
        return reply.status(serpApiError.statusCode).send(serpApiError.body);
      }
      app.log.error({ error }, 'eBay discovery run failed');
      return reply.status(500).send({
        error: 'eBay Discovery failed while saving results',
        details: error instanceof Error ? error.message.slice(0, 500) : 'Unexpected eBay Discovery persistence error'
      });
    }

    let comparison;
    if (parsed.data.autoCompare || parsed.data.mode === 'AUTO') {
      const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
      if (!keepaApiKey) {
        return reply.status(503).send({ error: 'KEEPA_API_KEY is required for automatic Amazon comparison' });
      }
      try {
        const requestedTokens = estimatedEbayDiscoveryTokens(parsed.data);
        const tokenStatus = await getKeepaTokenStatus(keepaApiKey);
        await recordApiUsage(prisma, { provider: 'keepa', endpoint: 'token', tokensLeft: tokenStatus.tokensLeft, context: 'ebay-discovery-run-autocompare' });
        if (tokenStatus.tokensLeft < requestedTokens) {
          const lowTokenResponse = lowKeepaTokenResponse(tokenStatus, requestedTokens);
          return reply.status(lowTokenResponse.statusCode).send(lowTokenResponse.body);
        }
      } catch (error) {
        if (error instanceof KeepaApiError) {
          const keepaError = keepaErrorResponse(error);
          return reply.status(keepaError.statusCode).send(keepaError.body);
        }
        throw error;
      }

      const runId = typeof persistedRun === 'object' && persistedRun && 'id' in persistedRun ? String(persistedRun.id) : undefined;
      if (runId) {
        try {
          const locked = await withSchedulerLock(
            prisma,
            { name: COMPARISON_LOCK_NAME, ttlMs: COMPARISON_LOCK_TTL_MS, metadata: { job: 'manual-ebay-discovery-run-autocompare' } },
            () => compareEbayDiscoveryCandidates({
              db: prisma,
              keepaApiKey,
              serpApiKey,
              ruleConfig: comparisonRuleConfig,
              runId,
              limit: parsed.data.compareLimit,
              marketKey: parsed.data.marketKey,
              amazonMatchLimit: parsed.data.amazonMatchLimit
            })
          );
          // If another comparison holds the lock, skip auto-compare; the run is persisted
          // and its candidates can be compared later.
          comparison = locked.acquired ? locked.result : undefined;
        } catch (error) {
          if (error instanceof KeepaApiError) {
            const keepaError = keepaErrorResponse(error);
            return reply.status(keepaError.statusCode).send(keepaError.body);
          }
          throw error;
        }
      }
    }

    const rejectedCandidates = [...result.rejected, ...result.sourceDropCandidates];

    return {
      run: sanitizePersistedRun(persistedRun),
      profile: result.profile,
      category: result.category,
      summary: {
        scanned: result.candidates.length + result.rejected.length + result.sourceDrops.total,
        accepted: result.candidates.length,
        rejected: rejectedCandidates.length,
        scoredRejected: result.rejected.length,
        sourceRejected: countRejectedByStages(rejectedCandidates, ['SOURCE_DATA', 'SOURCE_FORMAT']),
        sourceDropped: result.sourceDrops.total,
        auctionDropped: result.sourceDrops.auctionFormat,
        missingPriceDropped: result.sourceDrops.missingSoldPrice,
        nonNewDropped: result.sourceDrops.nonNewCondition,
        safetyRejected: countRejectedByStages(rejectedCandidates, ['SAFETY']),
        skippedExisting: result.skippedExisting,
        compared: comparison?.compared ?? 0,
        opportunities: comparison?.opportunities.length ?? 0,
        manualReviews: comparison?.manualReviews.length ?? 0
      },
      rejected: rejectedCandidates.map(sanitizeEbayDiscoveryCandidate),
      rejectedPreview: rejectedCandidates.slice(0, 5).map(sanitizeEbayDiscoveryCandidate),
      sourceDrops: result.sourceDrops,
      rejectionBreakdown: buildEbayRejectionBreakdown(rejectedCandidates),
      rejectionStageBreakdown: buildRejectionStageBreakdown(rejectedCandidates),
      comparison: comparison
        ? {
          ...comparison,
          opportunities: comparison.opportunities.map(sanitizeOpportunity),
          manualReviews: comparison.manualReviews.map(sanitizeOpportunity),
          rejected: comparison.rejected.map(sanitizeOpportunity)
        }
        : undefined
    };
  });

  app.post('/ebay-discovery/select', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = ebayDiscoverySelectRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid eBay discovery selection request', details: parsed.error.flatten() });
    }

    await prisma.ebayDiscoveryCandidate.updateMany({
      where: { id: { in: parsed.data.candidateIds } },
      data: { selected: parsed.data.selected }
    });
    return { selected: parsed.data.selected, count: parsed.data.candidateIds.length };
  });

  app.post('/ebay-discovery/compare', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = ebayDiscoveryCompareRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid eBay discovery comparison request', details: parsed.error.flatten() });
    }

    const keepaApiKey = await getSecret(prisma, 'KEEPA_API_KEY');
    if (!keepaApiKey) {
      return reply.status(503).send({ error: 'KEEPA_API_KEY is required for Amazon comparison' });
    }
    const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');

    // Token-budget pre-check (the scheduler does this; the manual route previously skipped it).
    try {
      const requestedTokens = estimatedEbayDiscoveryTokens({ compareLimit: parsed.data.limit, amazonMatchLimit: parsed.data.amazonMatchLimit });
      const tokenStatus = await getKeepaTokenStatus(keepaApiKey);
      await recordApiUsage(prisma, { provider: 'keepa', endpoint: 'token', tokensLeft: tokenStatus.tokensLeft, context: 'ebay-discovery-compare' });
      if (tokenStatus.tokensLeft < requestedTokens) {
        const lowTokenResponse = lowKeepaTokenResponse(tokenStatus, requestedTokens);
        return reply.status(lowTokenResponse.statusCode).send(lowTokenResponse.body);
      }
    } catch (error) {
      if (error instanceof KeepaApiError) {
        const keepaError = keepaErrorResponse(error);
        return reply.status(keepaError.statusCode).send(keepaError.body);
      }
      throw error;
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const comparisonRuleConfig = ruleConfigWithComparisonThresholds(ruleConfig, parsed.data.comparison);
    let comparison: Awaited<ReturnType<typeof compareEbayDiscoveryCandidates>>;
    try {
      const locked = await withSchedulerLock(
        prisma,
        { name: COMPARISON_LOCK_NAME, ttlMs: COMPARISON_LOCK_TTL_MS, metadata: { job: 'manual-ebay-discovery-compare' } },
        () => compareEbayDiscoveryCandidates({
          db: prisma,
          keepaApiKey,
          serpApiKey,
          ruleConfig: comparisonRuleConfig,
          runId: parsed.data.runId,
          candidateIds: parsed.data.candidateIds,
          limit: parsed.data.limit,
          marketKey: parsed.data.marketKey,
          amazonMatchLimit: parsed.data.amazonMatchLimit,
          force: parsed.data.force
        })
      );
      if (!locked.acquired) {
        return reply.status(409).send({
          error: 'An Amazon comparison run is already in progress. Try again shortly.',
          code: 'COMPARISON_IN_PROGRESS'
        });
      }
      comparison = locked.result;
    } catch (error) {
      if (error instanceof KeepaApiError) {
        const keepaError = keepaErrorResponse(error);
        return reply.status(keepaError.statusCode).send(keepaError.body);
      }
      throw error;
    }

    return comparison;
  });

  app.post('/ebay-discovery/consider', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = ebayDiscoveryConsiderRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid eBay discovery review request', details: parsed.error.flatten() });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const result = await considerEbayDiscoveryCandidate({
      db: prisma,
      candidateId: parsed.data.candidateId,
      note: parsed.data.note,
      ruleConfig
    });
    return result;
  });
}
