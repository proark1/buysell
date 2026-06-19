import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { createOrderAndBuyAction, recordAmazonPurchaseRows } from '../repositories/orderRepository.js';
import { enforceDailyPurchaseLimit, lockDailyPurchaseBudget } from '../services/spendLimits.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { getSecret } from '../services/secrets.js';
import { getEbayAccessToken } from '../clients/ebaySellClient.js';
import { fetchRecentEbayOrders } from '../clients/ebayFulfillmentClient.js';

const ebayOrderSchema = z.object({
  ebayOrderId: z.string().min(1),
  ebayItemId: z.string().min(1),
  buyerName: z.string().min(1).optional(),
  buyerShippingAddress: z.unknown(),
  salePrice: z.number().positive()
});

const orderParamsSchema = z.object({ id: z.string().min(1) });
const purchaseStatuses = ['PENDING', 'PURCHASED', 'SHIPPED', 'CANCELLED', 'ERROR'] as const;
const budgetCountingStatuses = new Set<string>(['PENDING', 'PURCHASED', 'SHIPPED']);
const amazonPurchaseSchema = z.object({
  asin: z.string().min(1),
  amazonOrderId: z.string().min(1).optional(),
  purchasePrice: z.number().positive().optional(),
  trackingNumber: z.string().min(1).optional(),
  carrier: z.string().min(1).optional(),
  status: z.enum(purchaseStatuses).optional()
});

const ebayOrderSyncSchema = z.object({
  lookbackHours: z.number().int().positive().max(24 * 30).default(24),
  limit: z.number().int().positive().max(100).default(50)
}).default({});

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/orders/ebay/manual', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = ebayOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid eBay order payload', details: parsed.error.flatten() });
    }

    return await createOrderAndBuyAction(prisma, parsed.data);
  });

  app.post('/orders/ebay/sync', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = ebayOrderSyncSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid eBay order sync payload', details: parsed.error.flatten() });
    }

    const clientId = await getSecret(prisma, 'EBAY_CLIENT_ID');
    const clientSecret = await getSecret(prisma, 'EBAY_CLIENT_SECRET');
    const refreshToken = await getSecret(prisma, 'EBAY_REFRESH_TOKEN');
    const sandbox = (await getSecret(prisma, 'EBAY_SANDBOX')) === 'true';
    if (!clientId || !clientSecret || !refreshToken) {
      return reply.status(503).send({ error: 'EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_REFRESH_TOKEN are required for eBay order sync' });
    }

    const accessToken = await getEbayAccessToken({ clientId, clientSecret, refreshToken, sandbox });
    const createdAfter = new Date(Date.now() - parsed.data.lookbackHours * 60 * 60 * 1000);
    const orders = await fetchRecentEbayOrders({
      accessToken,
      sandbox,
      createdAfter,
      limit: parsed.data.limit
    });

    const synced = [];
    const skipped = [];
    for (const order of orders) {
      const lineItem = order.lineItems.find((item) => item.ebayItemId);
      if (!lineItem?.ebayItemId) {
        skipped.push({ orderId: order.orderId, reason: 'No legacy eBay item ID on order line items.' });
        continue;
      }
      if (order.total === undefined || order.total <= 0) {
        skipped.push({ orderId: order.orderId, ebayItemId: lineItem.ebayItemId, reason: 'Order total is missing or not positive.' });
        continue;
      }
      try {
        synced.push(await createOrderAndBuyAction(prisma, {
          ebayOrderId: order.orderId,
          ebayItemId: lineItem.ebayItemId,
          buyerName: order.buyerName,
          buyerShippingAddress: order.buyerShippingAddress ?? { source: 'ebay-order-sync', orderId: order.orderId },
          salePrice: order.total
        }));
      } catch (error) {
        skipped.push({
          orderId: order.orderId,
          ebayItemId: lineItem.ebayItemId,
          reason: error instanceof Error ? error.message : 'Order could not be synced.'
        });
      }
    }

    return {
      scanned: orders.length,
      synced: synced.length,
      skipped
    };
  });

  app.post('/orders/:id/amazon-purchase', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = orderParamsSchema.safeParse(request.params);
    const body = amazonPurchaseSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid Amazon purchase payload',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    // A budget-counting purchase must carry a positive price, otherwise it would be
    // recorded with a null price and silently bypass the daily spend cap.
    const requestedStatus = body.data.status ?? 'PURCHASED';
    if (budgetCountingStatuses.has(requestedStatus) && body.data.purchasePrice === undefined) {
      return reply.status(400).send({
        error: 'A positive purchasePrice is required for a budget-counting purchase.',
        code: 'PURCHASE_PRICE_REQUIRED'
      });
    }

    // Enforce the daily spend cap and write the purchase in one serialized transaction
    // so this operator route can no longer bypass the budget that executeAction enforces.
    return await prisma.$transaction(async (tx) => {
      const status = body.data.status ?? 'PURCHASED';
      if (budgetCountingStatuses.has(status) && body.data.purchasePrice !== undefined) {
        await lockDailyPurchaseBudget(tx);
        await enforceDailyPurchaseLimit(tx, body.data.purchasePrice);
      }
      return recordAmazonPurchaseRows(tx, params.data.id, body.data);
    });
  });
}
