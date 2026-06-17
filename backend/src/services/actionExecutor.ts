import type { PrismaClient } from '@prisma/client';
import { getEbayAccessToken, prepareEbayListingDraft, withdrawEbayOffer } from '../clients/ebaySellClient.js';
import { getSecret } from './secrets.js';
import { badRequest, conflict, notFound } from '../security/httpErrors.js';
import { recordAmazonPurchase } from '../repositories/orderRepository.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';

interface ActionPayload {
  listingId?: string;
  ebayDraft?: unknown;
  ebayOfferId?: string;
  recommendedPrice?: number;
  recommendedTitle?: string;
  recommendedDescription?: string;
  asin?: string;
}

export interface ExecuteActionInput {
  actor?: string;
  result?: Record<string, unknown>;
}

const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const actionPayload = (value: unknown): ActionPayload => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as ActionPayload : {}
);

const startOfUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

async function enforceDailyListingLimit(db: PrismaClient): Promise<void> {
  const config = await getActiveRuleConfig(db);
  const completedToday = await db.actionItem.count({
    where: {
      type: 'LIST',
      status: 'COMPLETED',
      reviewedAt: { gte: startOfUtcDay() }
    }
  });
  if (completedToday >= config.maxDailyListings) {
    throw conflict(`Daily listing limit reached (${completedToday}/${config.maxDailyListings}).`, 'DAILY_LISTING_LIMIT_REACHED');
  }
}

async function enforceDailyPurchaseLimit(db: PrismaClient, purchaseAmount: number): Promise<void> {
  const config = await getActiveRuleConfig(db);
  const purchases = await db.amazonPurchase.findMany({
    where: {
      createdAt: { gte: startOfUtcDay() },
      status: { notIn: ['CANCELLED', 'ERROR'] }
    },
    select: { purchasePrice: true }
  });
  const spentToday = purchases.reduce((sum: number, purchase: { purchasePrice: unknown }) => sum + (numberValue(purchase.purchasePrice) ?? 0), 0);
  if (spentToday + purchaseAmount > config.maxDailyPurchaseAmountUsd) {
    throw conflict(
      `Daily purchase limit would be exceeded (${(spentToday + purchaseAmount).toFixed(2)}/${config.maxDailyPurchaseAmountUsd.toFixed(2)}).`,
      'DAILY_PURCHASE_LIMIT_REACHED'
    );
  }
}

export async function executeAction(db: PrismaClient, actionId: string, input: ExecuteActionInput = {}): Promise<unknown> {
  const action = await db.actionItem.findUnique({ where: { id: actionId } });
  if (!action) throw notFound('Action not found', 'ACTION_NOT_FOUND');
  if (action.status !== 'APPROVED') throw conflict('Action must be APPROVED before execution', 'ACTION_NOT_APPROVED');

  const actor = input.actor ?? 'action-executor';

  if (action.type === 'LIST') {
    await enforceDailyListingLimit(db);
    const payload = actionPayload(action.payloadJson);
    const draft = prepareEbayListingDraft({
      sku: action.productCandidateId ?? action.id,
      title: payload.recommendedTitle ?? `Pending listing ${action.id}`,
      description: payload.recommendedDescription ?? action.reason,
      price: payload.recommendedPrice ?? 0,
      quantity: 1,
      marketplaceId: (await getSecret(db, 'EBAY_MARKETPLACE_ID')) ?? 'EBAY_US'
    });

    await db.$transaction(async (tx) => {
      await tx.actionItem.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          payloadJson: { ...payload, ebayDraft: draft, executionResult: input.result }
        }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ActionItem',
          entityId: action.id,
          action: 'LISTING_DRAFT_PREPARED',
          actor,
          afterJson: { draft, executionResult: input.result }
        }
      });
    });

    return draft;
  }

  if (action.type === 'PAUSE') {
    const payload = actionPayload(action.payloadJson);
    const listing = payload.listingId ? await db.ebayListing.findUnique({ where: { id: payload.listingId } }) : undefined;
    const offerId = payload.ebayOfferId ?? listing?.ebayOfferId;
    let ebayResult: unknown = { skipped: true, reason: 'Missing eBay credentials or offer ID' };

    const clientId = await getSecret(db, 'EBAY_CLIENT_ID');
    const clientSecret = await getSecret(db, 'EBAY_CLIENT_SECRET');
    const refreshToken = await getSecret(db, 'EBAY_REFRESH_TOKEN');

    if (offerId && clientId && clientSecret && refreshToken) {
      const sandbox = (await getSecret(db, 'EBAY_SANDBOX')) === 'true';
      const accessToken = await getEbayAccessToken({ clientId, clientSecret, refreshToken, sandbox });
      ebayResult = await withdrawEbayOffer({ offerId, accessToken, sandbox });
    }

    await db.$transaction(async (tx) => {
      if (listing) await tx.ebayListing.update({ where: { id: listing.id }, data: { listingStatus: 'PAUSED' } });
      await tx.actionItem.update({ where: { id: action.id }, data: { status: 'COMPLETED', reviewedBy: actor, reviewedAt: new Date(), payloadJson: { ...payload, ebayResult, executionResult: input.result } } });
      await tx.auditLog.create({
        data: {
          entityType: 'ActionItem',
          entityId: action.id,
          action: 'PAUSE_ACTION_EXECUTED',
          actor,
          afterJson: { listingId: listing?.id, offerId, ebayResult, executionResult: input.result }
        }
      });
    });
    return { listingId: listing?.id, offerId, ebayResult };
  }

  if (action.type === 'REPRICE') {
    const payload = actionPayload(action.payloadJson);
    const listingId = payload.listingId;
    const recommendedPrice = numberValue(input.result?.recommendedPrice) ?? numberValue(input.result?.price) ?? payload.recommendedPrice;
    if (!listingId) throw badRequest('REPRICE action requires listingId in payload', 'REPRICE_LISTING_ID_REQUIRED');
    if (recommendedPrice === undefined || recommendedPrice <= 0) throw badRequest('REPRICE action requires a positive recommended price', 'REPRICE_PRICE_REQUIRED');

    const listing = await db.ebayListing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound('eBay listing not found', 'EBAY_LISTING_NOT_FOUND');

    await db.$transaction(async (tx) => {
      await tx.ebayListing.update({ where: { id: listing.id }, data: { listedPrice: recommendedPrice.toFixed(2) } });
      await tx.actionItem.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          payloadJson: { ...payload, previousPrice: listing.listedPrice, appliedPrice: recommendedPrice, executionResult: input.result }
        }
      });
      await tx.auditLog.create({
        data: {
          entityType: 'EbayListing',
          entityId: listing.id,
          action: 'LISTING_REPRICED',
          actor,
          beforeJson: { listedPrice: listing.listedPrice },
          afterJson: { listedPrice: recommendedPrice, actionItemId: action.id, executionResult: input.result }
        }
      });
    });

    return { listingId: listing.id, listedPrice: recommendedPrice };
  }

  if (action.type === 'BUY') {
    const payload = actionPayload(action.payloadJson);
    if (!action.orderId) throw badRequest('BUY action requires an orderId', 'BUY_ORDER_ID_REQUIRED');
    const asin = stringValue(input.result?.asin) ?? payload.asin;
    if (!asin) throw badRequest('BUY execution requires an ASIN', 'BUY_ASIN_REQUIRED');
    const amazonOrderId = stringValue(input.result?.amazonOrderId);
    const purchasePrice = numberValue(input.result?.purchasePrice);
    const estimatedPurchaseAmount = purchasePrice ?? numberValue((payload as Record<string, unknown>).maxPrice);
    const trackingNumber = stringValue(input.result?.trackingNumber);
    const carrier = stringValue(input.result?.carrier);
    const status = stringValue(input.result?.status) ?? 'PURCHASED';
    if (!amazonOrderId && purchasePrice === undefined) {
      throw badRequest('BUY execution requires amazonOrderId or purchasePrice evidence', 'BUY_PURCHASE_EVIDENCE_REQUIRED');
    }
    if (estimatedPurchaseAmount === undefined || estimatedPurchaseAmount <= 0) {
      throw badRequest('BUY execution requires a positive purchasePrice or payload maxPrice', 'BUY_PURCHASE_AMOUNT_REQUIRED');
    }
    await enforceDailyPurchaseLimit(db, estimatedPurchaseAmount);

    const purchase = await recordAmazonPurchase(db, action.orderId, {
      asin,
      amazonOrderId,
      purchasePrice,
      trackingNumber,
      carrier,
      status
    });
    await db.actionItem.update({
      where: { id: action.id },
      data: {
        status: 'COMPLETED',
        reviewedBy: actor,
        reviewedAt: new Date(),
        payloadJson: { ...payload, executionResult: input.result }
      }
    });
    return { actionId: action.id, purchase };
  }

  if (action.type === 'REVIEW') {
    const payload = actionPayload(action.payloadJson);
    const result = {
      actionId: action.id,
      actionType: action.type,
      status: 'COMPLETED',
      reason: action.reason
    };

    await db.$transaction(async (tx) => {
      await tx.actionItem.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          reviewedBy: actor,
          reviewedAt: new Date(),
          payloadJson: { ...payload, manualReviewCompletedAt: new Date().toISOString(), executionResult: input.result }
        }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ActionItem',
          entityId: action.id,
          action: 'MANUAL_REVIEW_COMPLETED',
          actor,
          afterJson: { ...result, executionResult: input.result }
        }
      });
    });

    return result;
  }

  if (action.type === 'VERIFY') {
    throw conflict('VERIFY actions must be completed through /actions/:id/verification-result with browser-observed prices and conditions', 'VERIFY_EXECUTION_NOT_ALLOWED');
  }

  throw badRequest(`Execution is not implemented for action type ${action.type}`, 'ACTION_EXECUTION_NOT_IMPLEMENTED');
}
