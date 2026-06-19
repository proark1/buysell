import type { PrismaClient } from '@prisma/client';
import { getAmazonProductByAsin, keepaDomainIdFromAmazonUrl } from '../clients/keepaClient.js';
import { notify } from './notificationService.js';

// Allow this much drift above the listing-time max price before flagging the BUY.
const PRICE_TOLERANCE = 0.05;

const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;
const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/**
 * Re-check the live Amazon buy-box price/availability for a freshly created BUY action,
 * since the listing-time maxPrice can be stale by the time an eBay item sells. Refreshes
 * maxPrice, records a PriceObservation, and flags a purchase risk (+ alert) when the source
 * went out of stock or rose beyond tolerance. The action stays PENDING for human approval.
 */
export async function recheckBuyActionPrice(db: PrismaClient, actionId: string, keepaApiKey: string): Promise<void> {
  const action = await db.actionItem.findUnique({ where: { id: actionId } });
  if (!action || action.type !== 'BUY') return;
  const payload = action.payloadJson && typeof action.payloadJson === 'object' && !Array.isArray(action.payloadJson)
    ? action.payloadJson as Record<string, unknown>
    : {};
  const asin = stringValue(payload.asin);
  if (!asin) return;

  let live;
  try {
    live = await getAmazonProductByAsin({ apiKey: keepaApiKey, asin, domain: keepaDomainIdFromAmazonUrl(stringValue(payload.amazonUrl)) });
  } catch {
    // Never block order intake on a transient Keepa failure.
    return;
  }
  if (!live) return;

  const previousMaxPrice = numberValue(payload.maxPrice);
  const livePrice = live.buyBoxPrice ?? live.currentPrice;
  const availability = live.availabilityStatus;
  const outOfStock = livePrice === undefined || (typeof availability === 'string' && /out.?of.?stock|unavailable|no.?price/i.test(availability));
  const tooExpensive = previousMaxPrice !== undefined && livePrice !== undefined && livePrice > previousMaxPrice * (1 + PRICE_TOLERANCE);

  if (livePrice !== undefined && action.productCandidateId) {
    await db.priceObservation.create({
      data: {
        productCandidateId: action.productCandidateId,
        amazonMatchId: action.amazonMatchId ?? undefined,
        marketplace: 'AMAZON',
        source: 'keepa-buy-recheck',
        observedPrice: livePrice.toFixed(2),
        availabilityStatus: typeof availability === 'string' ? availability : undefined
      }
    });
  }

  const purchaseRisk = outOfStock ? 'OUT_OF_STOCK' : tooExpensive ? 'PRICE_ABOVE_MAX' : undefined;
  await db.actionItem.update({
    where: { id: actionId },
    data: {
      // Keep the human-approval gate (PENDING) but raise priority so risky buys surface.
      priority: purchaseRisk ? Math.max(action.priority - 5, 1) : action.priority,
      payloadJson: {
        ...payload,
        maxPrice: livePrice ?? previousMaxPrice,
        priceRecheck: {
          checkedAt: new Date().toISOString(),
          livePrice,
          previousMaxPrice,
          availabilityStatus: typeof availability === 'string' ? availability : null,
          purchaseRisk: purchaseRisk ?? null
        }
      }
    }
  });

  if (purchaseRisk) {
    notify(db, {
      code: 'BUY_PRICE_RISK',
      severity: 'high',
      title: 'Amazon source price/stock changed before purchase',
      message: purchaseRisk === 'OUT_OF_STOCK'
        ? `ASIN ${asin} appears out of stock; review before purchasing order action ${actionId}.`
        : `ASIN ${asin} buy-box ${livePrice} is above the ${previousMaxPrice} max; review action ${actionId}.`,
      data: { actionId, asin, livePrice, previousMaxPrice, purchaseRisk }
    });
  }
}
