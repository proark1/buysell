import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { importSoldWinnerCsvFile, soldWinnerDb } from '../services/soldWinnerSeeds.js';

const importRequestSchema = z.object({
  path: z.string().min(1)
});

const summaryQuerySchema = z.object({
  take: z.coerce.number().int().positive().max(200).default(50)
});

const numberValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const parsed = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function registerSoldWinnerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/sold-winners/import', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = importRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid sold-winner import request', details: parsed.error.flatten() });
    }

    const summary = await importSoldWinnerCsvFile(prisma, parsed.data.path);
    return { summary };
  });

  app.get('/sold-winners/summary', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = summaryQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid sold-winner summary query', details: parsed.error.flatten() });
    }

    const db = soldWinnerDb(prisma);
    const [seedCount, familyCount, watchItems] = await Promise.all([
      db.soldWinnerSeed.count(),
      db.soldWinnerSeed.findMany({ distinct: ['familyKey'], select: { familyKey: true } }),
      db.replenishmentWatchItem.findMany({
        orderBy: [{ priority: 'asc' }, { lastSoldAt: 'desc' }],
        take: parsed.data.take
      })
    ]);

    return {
      seedCount,
      familyCount: familyCount.length,
      watchlistCount: watchItems.length,
      watchlist: watchItems.map((item) => ({
        id: item.id,
        familyKey: item.familyKey,
        title: item.title,
        saleCount: item.saleCount,
        totalQuantitySold: item.totalQuantitySold,
        averageSellingPrice: numberValue(item.averageSellingPrice),
        averageUnitCost: numberValue(item.averageUnitCost),
        totalNetProfit: numberValue(item.totalNetProfit),
        targetBuyPrice: numberValue(item.targetBuyPrice),
        targetSellPrice: numberValue(item.targetSellPrice),
        priority: item.priority,
        status: item.status,
        lastSoldAt: item.lastSoldAt
      }))
    };
  });
}
