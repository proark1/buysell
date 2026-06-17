import type { PrismaClient } from '@prisma/client';
import { getEbayAccessToken, prepareEbayListingDraft, withdrawEbayOffer } from '../clients/ebaySellClient.js';
import { getSecret } from './secrets.js';

interface ActionPayload {
  listingId?: string;
  ebayDraft?: unknown;
  ebayOfferId?: string;
  recommendedPrice?: number;
  recommendedTitle?: string;
  recommendedDescription?: string;
}

export async function executeAction(db: PrismaClient, actionId: string): Promise<unknown> {
  const action = await db.actionItem.findUnique({ where: { id: actionId } });
  if (!action) throw new Error('Action not found');
  if (action.status !== 'APPROVED') throw new Error('Action must be APPROVED before execution');

  if (action.type === 'LIST') {
    const payload = (action.payloadJson ?? {}) as ActionPayload;
    const draft = prepareEbayListingDraft({
      sku: action.productCandidateId ?? action.id,
      title: payload.recommendedTitle ?? `Pending listing ${action.id}`,
      description: payload.recommendedDescription ?? action.reason,
      price: payload.recommendedPrice ?? 0,
      quantity: 1,
      marketplaceId: (await getSecret(db, 'EBAY_MARKETPLACE_ID')) ?? 'EBAY_US'
    });

    await db.actionItem.update({
      where: { id: action.id },
      data: {
        status: 'COMPLETED',
        reviewedBy: 'action-executor',
        reviewedAt: new Date(),
        payloadJson: { ...payload, ebayDraft: draft }
      }
    });

    await db.auditLog.create({
      data: {
        entityType: 'ActionItem',
        entityId: action.id,
        action: 'LISTING_DRAFT_PREPARED',
        actor: 'action-executor',
        afterJson: draft
      }
    });

    return draft;
  }

  if (action.type === 'PAUSE') {
    const payload = (action.payloadJson ?? {}) as ActionPayload;
    const listing = payload.listingId ? await db.ebayListing.findUnique({ where: { id: payload.listingId } }) : undefined;
    const offerId = payload.ebayOfferId ?? listing?.ebayOfferId;
    let ebayResult: unknown = { skipped: true, reason: 'Missing eBay credentials or offer ID' };

    const clientId = await getSecret(db, 'EBAY_CLIENT_ID');
    const clientSecret = await getSecret(db, 'EBAY_CLIENT_SECRET');
    const refreshToken = await getSecret(db, 'EBAY_REFRESH_TOKEN');

    if (offerId && clientId && clientSecret && refreshToken) {
      const accessToken = await getEbayAccessToken({ clientId, clientSecret, refreshToken });
      const sandbox = (await getSecret(db, 'EBAY_SANDBOX')) === 'true';
      ebayResult = await withdrawEbayOffer({ offerId, accessToken, sandbox });
    }

    if (listing) await db.ebayListing.update({ where: { id: listing.id }, data: { listingStatus: 'PAUSED' } });
    await db.actionItem.update({ where: { id: action.id }, data: { status: 'COMPLETED', reviewedBy: 'action-executor', reviewedAt: new Date(), payloadJson: { ...payload, ebayResult } } });
    await db.auditLog.create({
      data: {
        entityType: 'ActionItem',
        entityId: action.id,
        action: 'PAUSE_ACTION_EXECUTED',
        actor: 'action-executor',
        afterJson: { listingId: listing?.id, offerId, ebayResult }
      }
    });
    return { listingId: listing?.id, offerId, ebayResult };
  }

  if (action.type === 'REVIEW') {
    const payload = (action.payloadJson ?? {}) as ActionPayload;
    const result = {
      actionId: action.id,
      actionType: action.type,
      status: 'COMPLETED',
      reason: action.reason
    };

    await db.actionItem.update({
      where: { id: action.id },
      data: {
        status: 'COMPLETED',
        reviewedBy: 'action-executor',
        reviewedAt: new Date(),
        payloadJson: { ...payload, manualReviewCompletedAt: new Date().toISOString() }
      }
    });

    await db.auditLog.create({
      data: {
        entityType: 'ActionItem',
        entityId: action.id,
        action: 'MANUAL_REVIEW_COMPLETED',
        actor: 'action-executor',
        afterJson: result
      }
    });

    return result;
  }

  if (action.type === 'VERIFY') {
    throw new Error('VERIFY actions must be completed through /actions/:id/verification-result with browser-observed prices and conditions');
  }

  throw new Error(`Execution is not implemented for action type ${action.type}`);
}
