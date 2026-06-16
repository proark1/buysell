import type { PrismaClient } from '@prisma/client';
import { encryptJson } from '../security/encryption.js';

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

  if (!listing) {
    throw new Error(`No eBay listing found for item ${input.ebayItemId}`);
  }

  const order = await db.order.create({
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

  const action = await db.actionItem.create({
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

  await db.auditLog.create({
    data: {
      entityType: 'Order',
      entityId: order.id,
      action: 'ORDER_RECEIVED_BUY_ACTION_CREATED',
      actor: 'system',
      afterJson: { orderId: order.id, actionItemId: action.id, ebayOrderId: input.ebayOrderId }
    }
  });

  return { order, action };
}

export interface RecordAmazonPurchaseInput {
  asin: string;
  amazonOrderId?: string;
  purchasePrice?: number;
  trackingNumber?: string;
  carrier?: string;
  status?: string;
}

export async function recordAmazonPurchase(
  db: PrismaClient,
  orderId: string,
  input: RecordAmazonPurchaseInput
): Promise<unknown> {
  const purchase = await db.amazonPurchase.create({
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
      actor: 'local-agent',
      afterJson: {
        amazonPurchaseId: purchase.id,
        amazonOrderId: input.amazonOrderId,
        trackingNumber: input.trackingNumber,
        carrier: input.carrier,
        status: input.status ?? 'PURCHASED'
      }
    }
  });

  return { order, purchase };
}
