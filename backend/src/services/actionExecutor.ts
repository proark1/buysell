import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { getEbayAccessToken, prepareEbayListingDraft, withdrawEbayOffer } from '../clients/ebaySellClient.js';

interface ActionPayload {
  listingId?: string;
  ebayDraft?: unknown;
  ebayOfferId?: string;
  recommendedPrice?: number;
  recommendedTitle?: string;
  recommendedDescription?: string;
}

const hasEbayCredentials = (): boolean => Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET && env.EBAY_REFRESH_TOKEN);

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
      marketplaceId: env.EBAY_MARKETPLACE_ID
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

    if (offerId && hasEbayCredentials()) {
      const accessToken = await getEbayAccessToken({
        clientId: env.EBAY_CLIENT_ID as string,
        clientSecret: env.EBAY_CLIENT_SECRET as string,
        refreshToken: env.EBAY_REFRESH_TOKEN as string
      });
      ebayResult = await withdrawEbayOffer({ offerId, accessToken, sandbox: env.EBAY_SANDBOX === 'true' });
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

  throw new Error(`Execution is not implemented for action type ${action.type}`);
}
