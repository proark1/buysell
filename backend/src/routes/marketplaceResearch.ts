import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { getAmazonSpApiAccessToken, getMyFeesEstimateForAsin } from '../clients/amazonSpApiClient.js';
import { currencyForEbayMarketplace, getEbayAccessToken, searchEbayBrowseItems } from '../clients/ebaySellClient.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { getSecret } from '../services/secrets.js';
import { listMarketplaceEconomics } from '../services/marketplaceEconomics.js';
import { importSoldCompCsvFile, soldCompSummary } from '../services/soldComps.js';

type ResearchDb = typeof prisma & {
  apiUsage: {
    create(args: unknown): Promise<unknown>;
  };
};

const routeDb = prisma as ResearchDb;

const economicsQuerySchema = z.object({
  marketplaceKey: z.string().min(1).default('de')
});

const amazonFeesSchema = z.object({
  asin: z.string().min(10).max(20),
  listingPrice: z.number().positive(),
  shippingPrice: z.number().min(0).optional(),
  currencyCode: z.string().min(3).max(3).default('EUR'),
  marketplaceId: z.string().min(1).optional(),
  endpoint: z.string().url().optional(),
  isAmazonFulfilled: z.boolean().default(true),
  identifier: z.string().min(1).max(120).optional()
});

const ebayBrowseQuerySchema = z.object({
  query: z.string().min(1),
  marketplaceId: z.string().min(1).optional(),
  gtin: z.string().min(1).optional(),
  categoryIds: z.string().min(1).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  fixedPriceOnly: z.preprocess((value: unknown) => {
    if (value === undefined) return undefined;
    if (typeof value === 'string') return value !== 'false' && value !== '0';
    return value;
  }, z.boolean().default(true))
});

const soldCompImportSchema = z.object({
  path: z.string().min(1),
  source: z.string().min(1).default('terapeak'),
  marketplaceId: z.string().min(1).default('EBAY_DE'),
  currency: z.string().min(3).max(3).default('EUR')
});

const soldCompSummarySchema = z.object({
  marketplaceId: z.string().min(1).default('EBAY_DE')
});

const opportunityEvidenceParamsSchema = z.object({
  id: z.string().min(1)
});

const numberValue = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const parsed = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

function priceValue(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return numberValue(record.value);
}

async function ebayCredentials(): Promise<{
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  marketplaceId: string;
  sandbox: boolean;
}> {
  return {
    clientId: await getSecret(prisma, 'EBAY_CLIENT_ID'),
    clientSecret: await getSecret(prisma, 'EBAY_CLIENT_SECRET'),
    refreshToken: await getSecret(prisma, 'EBAY_REFRESH_TOKEN'),
    marketplaceId: (await getSecret(prisma, 'EBAY_MARKETPLACE_ID')) ?? 'EBAY_DE',
    sandbox: (await getSecret(prisma, 'EBAY_SANDBOX')) === 'true'
  };
}

async function amazonSpApiCredentials(): Promise<{
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  marketplaceId: string;
  endpoint: string;
}> {
  return {
    clientId: await getSecret(prisma, 'AMAZON_SP_API_CLIENT_ID'),
    clientSecret: await getSecret(prisma, 'AMAZON_SP_API_CLIENT_SECRET'),
    refreshToken: await getSecret(prisma, 'AMAZON_SP_API_REFRESH_TOKEN'),
    marketplaceId: (await getSecret(prisma, 'AMAZON_SP_API_MARKETPLACE_ID')) ?? 'A1PA6795UKMFR9',
    endpoint: (await getSecret(prisma, 'AMAZON_SP_API_ENDPOINT')) ?? 'https://sellingpartnerapi-eu.amazon.com'
  };
}

export async function registerMarketplaceResearchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/economics', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = economicsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid economics query', details: parsed.error.flatten() });
    return listMarketplaceEconomics(prisma, parsed.data.marketplaceKey);
  });

  app.post('/api/amazon/fees/estimate', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = amazonFeesSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid Amazon fees request', details: parsed.error.flatten() });

    const credentials = await amazonSpApiCredentials();
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      return reply.status(503).send({ error: 'Amazon SP-API client ID, client secret, and refresh token are required.' });
    }

    const accessToken = await getAmazonSpApiAccessToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: credentials.refreshToken
    });
    const estimate = await getMyFeesEstimateForAsin({
      asin: parsed.data.asin,
      accessToken,
      endpoint: parsed.data.endpoint ?? credentials.endpoint,
      marketplaceId: parsed.data.marketplaceId ?? credentials.marketplaceId,
      listingPrice: parsed.data.listingPrice,
      shippingPrice: parsed.data.shippingPrice,
      currencyCode: parsed.data.currencyCode,
      isAmazonFulfilled: parsed.data.isAmazonFulfilled,
      identifier: parsed.data.identifier
    });
    await routeDb.apiUsage.create({
      data: {
        provider: 'amazon-sp-api',
        endpoint: 'products/fees/v0/items/{asin}/feesEstimate',
        tokensConsumed: 1,
        context: `asin:${parsed.data.asin}`
      }
    }).catch(() => undefined);
    return { estimate };
  });

  app.get('/api/ebay/browse/search', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = ebayBrowseQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid eBay Browse search query', details: parsed.error.flatten() });

    const credentials = await ebayCredentials();
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      return reply.status(503).send({ error: 'eBay client ID, client secret, and refresh token are required.' });
    }
    const marketplaceId = parsed.data.marketplaceId ?? credentials.marketplaceId;
    const accessToken = await getEbayAccessToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: credentials.refreshToken,
      sandbox: credentials.sandbox,
      scopes: ['https://api.ebay.com/oauth/api_scope']
    });
    const items = await searchEbayBrowseItems({
      accessToken,
      sandbox: credentials.sandbox,
      marketplaceId,
      query: parsed.data.query,
      gtin: parsed.data.gtin,
      categoryIds: parsed.data.categoryIds?.split(',').map((item: string) => item.trim()).filter(Boolean),
      minPrice: parsed.data.minPrice,
      maxPrice: parsed.data.maxPrice,
      buyingOptions: parsed.data.fixedPriceOnly ? ['FIXED_PRICE'] : undefined,
      limit: parsed.data.limit
    });
    const candidates = items.map((item) => ({
      itemId: item.itemId,
      title: item.title,
      url: item.itemWebUrl,
      activePrice: priceValue(item.price),
      currency: item.price?.currency ?? currencyForEbayMarketplace(marketplaceId),
      condition: item.condition,
      buyingOptions: item.buyingOptions,
      categories: item.categories,
      raw: item.raw
    }));
    await routeDb.apiUsage.create({
      data: {
        provider: 'ebay-browse',
        endpoint: 'buy/browse/v1/item_summary/search',
        tokensConsumed: 1,
        context: `marketplace:${marketplaceId}`
      }
    }).catch(() => undefined);
    return { marketplaceId, count: candidates.length, candidates };
  });

  app.post('/sold-comps/import', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = soldCompImportSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid sold-comp import request', details: parsed.error.flatten() });
    return {
      summary: await importSoldCompCsvFile(prisma, parsed.data.path, {
        source: parsed.data.source,
        marketplaceId: parsed.data.marketplaceId,
        currency: parsed.data.currency
      })
    };
  });

  app.get('/sold-comps/summary', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = soldCompSummarySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid sold-comp summary query', details: parsed.error.flatten() });
    return soldCompSummary(prisma, parsed.data.marketplaceId);
  });

  app.get('/api/opportunities/:id/evidence', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const parsed = opportunityEvidenceParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid opportunity id', details: parsed.error.flatten() });

    const opportunity = await prisma.productCandidate.findUnique({
      where: { id: parsed.data.id },
      include: {
        productFamily: true,
        amazonMatches: { orderBy: { createdAt: 'desc' }, take: 3 },
        profitSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { feeRateCard: true, vatMode: true }
        },
        aiDecisions: { orderBy: { createdAt: 'desc' }, take: 3 },
        actionItems: { orderBy: { createdAt: 'desc' }, take: 10 },
        priceVerifications: { orderBy: { createdAt: 'desc' }, take: 5 },
        priceObservations: { orderBy: { capturedAt: 'desc' }, take: 10 },
        ebayListings: { orderBy: { updatedAt: 'desc' }, take: 5 },
        opportunityFeedback: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });
    if (!opportunity) return reply.status(404).send({ error: 'Opportunity not found' });
    return { opportunity };
  });
}
