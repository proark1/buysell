import type { PrismaClient } from '@prisma/client';
import { encryptJson } from '../security/encryption.js';
import { notFound } from '../security/httpErrors.js';

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

  const existingOrder = await db.order.findUnique({ where: { ebayOrderId: input.ebayOrderId } });
  if (existingOrder) {
    const existingAction = await db.actionItem.findFirst({
      where: { orderId: existingOrder.id, type: 'BUY' },
      orderBy: { createdAt: 'desc' }
    });
    return { order: existingOrder, action: existingAction, alreadyRecorded: true };
  }

  return db.$transaction(async (tx) => {
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

export async function recordAmazonPurchaseRows(
  db: PrismaClient,
  orderId: string,
  input: RecordAmazonPurchaseInput,
  actor = 'local-agent'
): Promise<unknown> {
  const existingOrder = await db.order.findUnique({ where: { id: orderId } });
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
