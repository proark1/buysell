import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { createOrderAndBuyAction, recordAmazonPurchase } from '../repositories/orderRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';

const ebayOrderSchema = z.object({
  ebayOrderId: z.string().min(1),
  ebayItemId: z.string().min(1),
  buyerName: z.string().min(1).optional(),
  buyerShippingAddress: z.unknown(),
  salePrice: z.number().positive()
});

const orderParamsSchema = z.object({ id: z.string().min(1) });
const amazonPurchaseSchema = z.object({
  asin: z.string().min(1),
  amazonOrderId: z.string().min(1).optional(),
  purchasePrice: z.number().positive().optional(),
  trackingNumber: z.string().min(1).optional(),
  carrier: z.string().min(1).optional(),
  status: z.string().min(1).optional()
});

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/orders/ebay/manual', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = ebayOrderSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid eBay order payload', details: parsed.error.flatten() });
    }

    return await createOrderAndBuyAction(prisma, parsed.data);
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

    return await recordAmazonPurchase(prisma, params.data.id, body.data);
  });
}
