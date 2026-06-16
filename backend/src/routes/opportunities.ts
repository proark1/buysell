import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { buildOpportunities } from '../pipeline/opportunityPipeline.js';
import { persistOpportunities } from '../repositories/opportunityRepository.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';

const opportunityRequestSchema = z.object({
  query: z.string().min(2),
  limit: z.number().int().positive().max(25).optional(),
  persist: z.boolean().default(false)
});

export async function registerOpportunityRoutes(app: FastifyInstance): Promise<void> {
  app.post('/opportunities/search', async (request, reply) => {
    const parsed = opportunityRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid opportunity search request', details: parsed.error.flatten() });
    }

    if (!env.SERPAPI_API_KEY || !env.KEEPA_API_KEY) {
      return reply.status(503).send({ error: 'SERPAPI_API_KEY and KEEPA_API_KEY are required for opportunity search' });
    }

    if (parsed.data.persist && !env.DATABASE_URL) {
      return reply.status(503).send({ error: 'DATABASE_URL is required when persist is true' });
    }

    const ruleConfig = await getActiveRuleConfig(prisma);
    const opportunities = await buildOpportunities({
      query: parsed.data.query,
      limit: parsed.data.limit,
      serpApiKey: env.SERPAPI_API_KEY,
      keepaApiKey: env.KEEPA_API_KEY,
      thresholds: ruleConfig.thresholds,
      estimatedSalesTaxRate: ruleConfig.estimatedSalesTaxRate,
      returnRiskBuffer: ruleConfig.returnRiskBuffer,
      priceChangeBuffer: ruleConfig.priceChangeBuffer,
      blockedBrands: ruleConfig.blockedBrands,
      blockedCategories: ruleConfig.blockedCategories
    });

    const persisted = parsed.data.persist ? await persistOpportunities(prisma, opportunities) : [];

    return { opportunities, persisted };
  });
}
