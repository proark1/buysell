import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { getKeepaTokenStatus, KeepaApiError, type KeepaTokenStatus } from '../clients/keepaClient.js';
import { SerpApiError } from '../clients/serpApiClient.js';
import { buildOpportunities } from '../pipeline/opportunityPipeline.js';
import { persistOpportunities } from '../repositories/opportunityRepository.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';
import { amazonDiscoveryProfiles, discoveryProfiles, getDiscoveryProfile } from '../services/discoveryPolicy.js';
import {
  buildAmazonDiscoveryCandidates,
  compareAmazonDiscoveryCandidates,
  persistAmazonDiscoveryRun,
  type AmazonDiscoveryCandidateResult
} from '../services/amazonDiscovery.js';
import { getSecret } from '../services/secrets.js';
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

const amazonDiscoveryRunRequestSchema = z.object({
  profileKey: z.string().default('starter-safe'),
  categoryKey: z.string().optional(),
  query: z.string().min(2).optional(),
  limit: z.number().int().positive().max(100).optional(),
  mode: z.enum(['MANUAL', 'AUTO']).default('MANUAL'),
  autoCompare: z.boolean().default(false),
  compareLimit: z.number().int().positive().max(50).optional(),
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
  limit: z.number().int().positive().max(50).optional()
}).refine((value: { runId?: string; candidateIds?: string[] }) => value.runId || (value.candidateIds && value.candidateIds.length > 0), {
  message: 'runId or candidateIds is required'
});

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

export async function registerOpportunityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/opportunities/profiles', async () => ({ profiles: discoveryProfiles }));
  app.get('/amazon-discovery/profiles', async () => ({ profiles: amazonDiscoveryProfiles }));
  app.get('/amazon-discovery/token-status', async (_request, reply) => {
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
      safeMode: parsed.data.safeMode ?? ruleConfig.safeMode,
      blockedBrands: ruleConfig.blockedBrands,
      blockedCategories: ruleConfig.blockedCategories,
      blockedKeywords: ruleConfig.blockedKeywords,
      allowedCategories: ruleConfig.allowedCategories
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
        safeMode,
        blockedBrands: ruleConfig.blockedBrands,
        blockedCategories: ruleConfig.blockedCategories,
        blockedKeywords: ruleConfig.blockedKeywords,
        allowedCategories: ruleConfig.allowedCategories
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
      throw error;
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
            ruleConfig,
            runId,
            limit: parsed.data.compareLimit
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
        compared: comparison?.compared ?? 0,
        opportunities: comparison?.opportunities.length ?? 0
      },
      rejected: result.rejected.map(sanitizeAmazonDiscoveryCandidate),
      rejectedPreview: result.rejected.slice(0, 5).map(sanitizeAmazonDiscoveryCandidate),
      rejectionBreakdown: buildAmazonRejectionBreakdown(result.rejected),
      comparison: comparison
        ? {
          ...comparison,
          opportunities: comparison.opportunities.map(sanitizeOpportunity),
          rejected: comparison.rejected.map(sanitizeOpportunity)
        }
        : undefined
    };
  });

  app.post('/amazon-discovery/select', async (request, reply) => {
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
    const parsed = amazonDiscoveryCompareRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid Amazon discovery comparison request', details: parsed.error.flatten() });
    }

    const serpApiKey = await getSecret(prisma, 'SERPAPI_API_KEY');
    if (!serpApiKey) {
      return reply.status(503).send({ error: 'SERPAPI_API_KEY is required for eBay comparison' });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    let comparison: Awaited<ReturnType<typeof compareAmazonDiscoveryCandidates>>;
    try {
      comparison = await compareAmazonDiscoveryCandidates({
        db: prisma,
        serpApiKey,
        ruleConfig,
        runId: parsed.data.runId,
        candidateIds: parsed.data.candidateIds,
        limit: parsed.data.limit
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
}
