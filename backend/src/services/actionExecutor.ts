import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { prepareEbayListingDraft } from '../clients/ebaySellClient.js';

interface ActionPayload {
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

  throw new Error(`Execution is not implemented for action type ${action.type}`);
}
