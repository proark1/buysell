import type { PrismaClient } from '@prisma/client';
import { encryptJson } from '../security/encryption.js';
import { notFound } from '../security/httpErrors.js';
import { getActiveRuleConfig } from './ruleConfigRepository.js';
import { profitInputsFromRuleConfig } from '../services/profitInputs.js';
import { notify } from '../services/notificationService.js';

const toNum = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    const n = (value as { toNumber(): number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value: number): number => Math.round(value * 100) / 100;

const prismaErrorCode = (error: unknown): string | undefined => (
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
);

async function existingOrderResult(db: PrismaClient, ebayOrderId: string): Promise<unknown | undefined> {
  const existingOrder = await db.order.findUnique({ where: { ebayOrderId } });
  if (!existingOrder) return undefined;
  const existingAction = await db.actionItem.findFirst({
    where: { orderId: existingOrder.id, type: 'BUY' },
    orderBy: { createdAt: 'desc' }
  });
  return { order: existingOrder, action: existingAction, alreadyRecorded: true };
}

export interface CreateEbayOrderInput {
  ebayOrderId: string;
  ebayItemId: string;
  buyerName?: string;
  buyerShippingAddress: unknown;
  salePrice: number;
}

const money = (value: number): string => value.toFixed(2);

export async function createOrderAndBuyAction(db: PrismaClient, input: CreateEbayOrderInput): Promise<unknown> {
  const listing = await db.ebayListing.findUnique({
    where: { ebayItemId: input.ebayItemId },
    include: { amazonMatch: true, productCandidate: true }
  });

  if (!listing) throw notFound(`No eBay listing found for item ${input.ebayItemId}`, 'EBAY_LISTING_NOT_FOUND');

  const existing = await existingOrderResult(db, input.ebayOrderId);
  if (existing) return existing;

  try {
    const created = await db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        ebayOrderId: input.ebayOrderId,
        ebayListingId: listing.id,
        buyerName: input.buyerName,
        buyerShippingAddressEncrypted: encryptJson(input.buyerShippingAddress),
        salePrice: money(input.salePrice),
        orderStatus: 'READY_FOR_PURCHASE',
        fulfillmentStatus: 'PENDING',
        amazonOrderStatus: 'NOT_STARTED'
      }
    });

    const action = await tx.actionItem.create({
      data: {
        productCandidateId: listing.productCandidateId,
        amazonMatchId: listing.amazonMatchId,
        orderId: order.id,
        type: 'BUY',
        priority: 10,
        reason: `eBay order ${input.ebayOrderId} is ready for Amazon purchase review.`,
        payloadJson: {
          ebayOrderId: input.ebayOrderId,
          ebayItemId: input.ebayItemId,
          asin: listing.amazonMatch?.asin,
          amazonUrl: listing.amazonMatch?.amazonUrl,
          maxPrice: listing.amazonMatch?.buyBoxPrice ?? listing.amazonMatch?.currentPrice,
          salePrice: input.salePrice
        }
      }
    });

    await tx.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: order.id,
        action: 'ORDER_RECEIVED_BUY_ACTION_CREATED',
        actor: 'system',
        afterJson: { orderId: order.id, actionItemId: action.id, ebayOrderId: input.ebayOrderId }
      }
    });

    return { order, action, alreadyRecorded: false };
    });
    notify(db, {
      code: 'BUY_ACTION_CREATED',
      severity: 'high',
      title: 'eBay order ready for Amazon purchase',
      message: `eBay order ${input.ebayOrderId} created a BUY action awaiting review.`,
      data: { ebayOrderId: input.ebayOrderId, ebayItemId: input.ebayItemId }
    });
    return created;
  } catch (error) {
    // Concurrent sync/webhook deliveries for the same eBay order race on the unique
    // ebayOrderId; fall back to the already-created order so this stays idempotent.
    if (prismaErrorCode(error) === 'P2002') {
      const existingAfterRace = await existingOrderResult(db, input.ebayOrderId);
      if (existingAfterRace) return existingAfterRace;
    }
    throw error;
  }
}

async function upsertAmazonPurchase(
  db: PrismaClient,
  orderId: string,
  input: RecordAmazonPurchaseInput
): Promise<unknown> {
  const existing = await db.amazonPurchase.findFirst({
    where: {
      orderId,
      asin: input.asin,
      ...(input.amazonOrderId ? { amazonOrderId: input.amazonOrderId } : {})
    },
    orderBy: { createdAt: 'desc' }
  });

  if (existing) {
    return db.amazonPurchase.update({
      where: { id: existing.id },
      data: {
        amazonOrderId: input.amazonOrderId ?? existing.amazonOrderId,
        purchasePrice: input.purchasePrice === undefined ? existing.purchasePrice : money(input.purchasePrice),
        trackingNumber: input.trackingNumber ?? existing.trackingNumber,
        carrier: input.carrier ?? existing.carrier,
        status: input.status ?? existing.status
      }
    });
  }

  return db.amazonPurchase.create({
    data: {
      orderId,
      asin: input.asin,
      amazonOrderId: input.amazonOrderId,
      purchasePrice: input.purchasePrice === undefined ? undefined : money(input.purchasePrice),
      trackingNumber: input.trackingNumber,
      carrier: input.carrier,
      status: input.status ?? 'PURCHASED'
    }
  });
}

export interface RecordAmazonPurchaseInput {
  asin: string;
  amazonOrderId?: string;
  purchasePrice?: number;
  trackingNumber?: string;
  carrier?: string;
  status?: string;
}

/**
 * Record realized profit/loss for an order once an Amazon purchase is logged. Idempotent
 * per order (one ledger entry), so re-recording tracking/status never double-counts.
 * Marketplace fees are estimated from the active rule config; a later payout reconciliation
 * can refine them. Also rolls the net into the product family's realizedProfit.
 */
async function recordRealizedProfit(
  db: PrismaClient,
  order: { id: string; salePrice: unknown; ebayListingId: string; ebayListing?: { productCandidate?: { id: string; productFamilyId: string | null } | null } | null },
  sourceCost: number
): Promise<void> {
  const revenue = toNum(order.salePrice);
  if (revenue <= 0 || sourceCost <= 0) return;

  const existing = await db.profitLedgerEntry.findFirst({ where: { orderId: order.id }, select: { id: true } });
  if (existing) return;

  const ruleConfig = await getActiveRuleConfig(db);
  const inputs = profitInputsFromRuleConfig(ruleConfig);
  const feeRate = inputs.ebayFinalValueFeeRate + inputs.ebayPaymentFeeRate + inputs.promotedListingFeeRate;
  const marketplaceFees = round2(revenue * feeRate + inputs.paymentFixedFee);
  const shippingCost = round2(inputs.shippingLabelCost + inputs.packagingCost);
  const netProfit = round2(revenue - sourceCost - marketplaceFees - shippingCost);
  const candidate = order.ebayListing?.productCandidate ?? undefined;

  await db.profitLedgerEntry.create({
    data: {
      productCandidateId: candidate?.id,
      ebayListingId: order.ebayListingId,
      orderId: order.id,
      revenue: money(revenue),
      sourceCost: money(round2(sourceCost)),
      marketplaceFees: money(marketplaceFees),
      shippingCost: money(shippingCost),
      refunds: '0.00',
      netProfit: money(netProfit),
      notes: 'Auto-recorded on Amazon purchase (fees estimated from rule config).'
    }
  });

  if (candidate?.productFamilyId) {
    await db.productFamily.update({
      where: { id: candidate.productFamilyId },
      data: { realizedProfit: { increment: netProfit } }
    });
  }
}

export async function recordAmazonPurchaseRows(
  db: PrismaClient,
  orderId: string,
  input: RecordAmazonPurchaseInput,
  actor = 'local-agent'
): Promise<unknown> {
  const existingOrder = await db.order.findUnique({
    where: { id: orderId },
    include: { ebayListing: { include: { productCandidate: true } } }
  });
  if (!existingOrder) throw notFound('Order not found', 'ORDER_NOT_FOUND');

  const purchase = await upsertAmazonPurchase(db, orderId, input);
  const order = await db.order.update({
    where: { id: orderId },
    data: {
      orderStatus: input.trackingNumber ? 'SHIPPED' : 'PURCHASED',
      amazonOrderStatus: input.status ?? 'PURCHASED',
      fulfillmentStatus: input.trackingNumber ? 'TRACKING_RECEIVED' : 'AWAITING_TRACKING'
    }
  });

  // Record realized P/L for budget-counting purchases (skip cancellations/errors).
  const purchaseStatus = input.status ?? 'PURCHASED';
  if (purchaseStatus !== 'CANCELLED' && purchaseStatus !== 'ERROR') {
    const sourceCost = input.purchasePrice ?? toNum((purchase as { purchasePrice?: unknown }).purchasePrice);
    await recordRealizedProfit(db, existingOrder, sourceCost);
  }

  await db.auditLog.create({
    data: {
      entityType: 'Order',
      entityId: orderId,
      action: 'AMAZON_PURCHASE_RECORDED',
      actor,
      afterJson: {
        amazonPurchaseId: typeof purchase === 'object' && purchase && 'id' in purchase ? purchase.id : undefined,
        amazonOrderId: input.amazonOrderId,
        trackingNumber: input.trackingNumber,
        carrier: input.carrier,
        status: input.status ?? 'PURCHASED'
      }
    }
  });

  return { order, purchase };
}

export async function recordAmazonPurchase(
  db: PrismaClient,
  orderId: string,
  input: RecordAmazonPurchaseInput
): Promise<unknown> {
  return db.$transaction((tx) => recordAmazonPurchaseRows(tx, orderId, input));
}
