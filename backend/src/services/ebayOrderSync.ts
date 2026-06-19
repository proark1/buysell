import type { PrismaClient } from '@prisma/client';
import { getSecret } from './secrets.js';
import { getEbayAccessToken } from '../clients/ebaySellClient.js';
import { fetchRecentEbayOrders } from '../clients/ebayFulfillmentClient.js';
import { createOrderAndBuyAction } from '../repositories/orderRepository.js';
import { recheckBuyActionPrice } from './buyPriceRecheck.js';

export interface EbayOrderSyncOptions {
  lookbackHours: number;
  limit: number;
}

export type EbayOrderSyncResult =
  | { status: 'MISSING_CREDENTIALS' }
  | { status: 'OK'; scanned: number; synced: number; skipped: Array<Record<string, unknown>> };

/**
 * Pull recent eBay orders and create BUY actions for any not already recorded. Shared by
 * the manual /orders/ebay/sync route and the background order-sync scheduler.
 */
export async function runEbayOrderSync(db: PrismaClient, options: EbayOrderSyncOptions): Promise<EbayOrderSyncResult> {
  const clientId = await getSecret(db, 'EBAY_CLIENT_ID');
  const clientSecret = await getSecret(db, 'EBAY_CLIENT_SECRET');
  const refreshToken = await getSecret(db, 'EBAY_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) return { status: 'MISSING_CREDENTIALS' };

  const sandbox = (await getSecret(db, 'EBAY_SANDBOX')) === 'true';
  const accessToken = await getEbayAccessToken({ clientId, clientSecret, refreshToken, sandbox });
  const createdAfter = new Date(Date.now() - options.lookbackHours * 60 * 60 * 1000);
  const orders = await fetchRecentEbayOrders({ accessToken, sandbox, createdAfter, limit: options.limit });
  const keepaApiKey = await getSecret(db, 'KEEPA_API_KEY');

  const skipped: Array<Record<string, unknown>> = [];
  let synced = 0;
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
      const created = await createOrderAndBuyAction(db, {
        ebayOrderId: order.orderId,
        ebayItemId: lineItem.ebayItemId,
        buyerName: order.buyerName,
        buyerShippingAddress: order.buyerShippingAddress ?? { source: 'ebay-order-sync', orderId: order.orderId },
        salePrice: order.total
      }) as { action?: { id?: string }; alreadyRecorded?: boolean };
      synced += 1;
      // Re-check the live Amazon price/stock for newly created BUY actions so a stale
      // listing-time maxPrice can't lock in a loss.
      const actionId = created.action?.id;
      if (keepaApiKey && actionId && !created.alreadyRecorded) {
        await recheckBuyActionPrice(db, actionId, keepaApiKey);
      }
    } catch (error) {
      skipped.push({
        orderId: order.orderId,
        ebayItemId: lineItem.ebayItemId,
        reason: error instanceof Error ? error.message : 'Order could not be synced.'
      });
    }
  }

  return { status: 'OK', scanned: orders.length, synced, skipped };
}
