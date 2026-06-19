import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calculateProfit } from '../services/profitCalculator.js';

const profitRequestSchema = z.object({
  ebaySalePrice: z.number().positive(),
  ebayShippingPrice: z.number().min(0).optional(),
  amazonItemCost: z.number().positive(),
  ebayFinalValueFeeRate: z.number().min(0).optional(),
  categoryFinalValueFeeRate: z.number().min(0).optional(),
  ebayPaymentFeeRate: z.number().min(0).optional(),
  promotedListingFeeRate: z.number().min(0).optional(),
  currencyConversionBufferRate: z.number().min(0).optional(),
  insertionFee: z.number().min(0).optional(),
  listingUpgradeFees: z.number().min(0).optional(),
  promotedListingFixedFee: z.number().min(0).optional(),
  amazonShippingCost: z.number().min(0).optional(),
  sourceShippingCost: z.number().min(0).optional(),
  shippingLabelCost: z.number().min(0).optional(),
  packagingCost: z.number().min(0).optional(),
  paymentFixedFee: z.number().min(0).optional(),
  returnReserveRate: z.number().min(0).optional(),
  returnShippingReserveRate: z.number().min(0).optional(),
  cancellationReserveRate: z.number().min(0).optional(),
  marketplaceRiskBuffer: z.number().min(0).optional(),
  stockoutRiskBuffer: z.number().min(0).optional(),
  estimatedSalesTaxRate: z.number().min(0).optional(),
  returnRiskBuffer: z.number().min(0).optional(),
  priceChangeBuffer: z.number().min(0).optional()
});

export async function registerProfitRoutes(app: FastifyInstance): Promise<void> {
  app.post('/profit/calculate', async (request, reply) => {
    const parsed = profitRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid profit calculation request', details: parsed.error.flatten() });
    }

    return calculateProfit(parsed.data);
  });
}
