import type { PrismaClient } from '@prisma/client';
import type { OpportunityDecision } from '../domain/products.js';
import { badRequest, conflict, notFound } from '../security/httpErrors.js';

export interface CreateActionInput {
  productCandidateId?: string;
  amazonMatchId?: string;
  decision: OpportunityDecision;
}

type QueueActionType = 'VERIFY' | 'LIST' | 'REPRICE' | 'PAUSE' | 'REVIEW';

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const money = (value: unknown): string | undefined => {
  const parsed = numberValue(value);
  return parsed === undefined ? undefined : parsed.toFixed(2);
};

const actionTypeForDecision = (decision: OpportunityDecision['decision']): QueueActionType | undefined => {
  if (decision === 'LIST') return 'VERIFY';
  if (decision === 'REPRICE') return 'REPRICE';
  if (decision === 'PAUSE') return 'PAUSE';
  if (decision === 'MANUAL_REVIEW') return 'REVIEW';
  return undefined;
};

const decisionPayload = (decision: OpportunityDecision): Record<string, unknown> => ({
  decision: decision.decision,
  confidence: decision.confidence,
  riskFlags: decision.riskFlags,
  recommendedPrice: decision.recommendedPrice,
  recommendedTitle: decision.recommendedTitle,
  recommendedDescription: decision.recommendedDescription
});

const hasTransaction = (db: PrismaClient): boolean => typeof (db as unknown as { $transaction?: unknown }).$transaction === 'function';

async function createVerificationActionRows(db: PrismaClient, input: CreateActionInput, type: QueueActionType): Promise<string> {
  if (!input.productCandidateId) throw badRequest('Product candidate is required for live listing verification');

  const [productCandidate, amazonMatch] = await Promise.all([
    db.productCandidate.findUnique({ where: { id: input.productCandidateId } }),
    input.amazonMatchId ? db.amazonMatch.findUnique({ where: { id: input.amazonMatchId } }) : Promise.resolve(undefined)
  ]);

  const expectedAmazonPrice = money(amazonMatch?.buyBoxPrice ?? amazonMatch?.currentPrice);
  const expectedEbayPrice = money(productCandidate?.ebaySoldPrice);
  const expectedBrand = typeof amazonMatch?.brand === 'string' ? amazonMatch.brand : undefined;
  const amazonUrl = typeof amazonMatch?.amazonUrl === 'string' ? amazonMatch.amazonUrl : undefined;
  const ebayUrl = typeof productCandidate?.ebayUrl === 'string' ? productCandidate.ebayUrl : undefined;
  const action = await db.actionItem.create({
    data: {
      productCandidateId: input.productCandidateId,
      amazonMatchId: input.amazonMatchId,
      type,
      priority: 15,
      reason: `Live browser price and condition verification required before listing. ${input.decision.reasoningSummary}`,
      payloadJson: {
        ...decisionPayload(input.decision),
        verificationRequired: true,
        pendingActionType: 'LIST',
        expectedAmazonUrl: amazonUrl,
        expectedEbayUrl: ebayUrl,
        expectedAmazonPrice: numberValue(expectedAmazonPrice),
        expectedEbayPrice: numberValue(expectedEbayPrice),
        expectedBrand,
        expectedCondition: 'NEW',
        expectedBuyingFormat: 'BIN',
        verificationInstructions: [
          'Open the Amazon product link in the real browser and read the current product price, brand, and condition.',
          'Open the eBay sold-item link in the real browser and confirm sold price, fixed-price format, and new condition.',
          'Submit the observed values to the verification-result endpoint before any listing action is created.'
        ]
      }
    }
  });

  await db.priceVerification.create({
    data: {
      productCandidateId: input.productCandidateId,
      amazonMatchId: input.amazonMatchId,
      actionItemId: action.id,
      status: 'PENDING',
      amazonUrl,
      ebayUrl,
      expectedAmazonPrice,
      expectedEbayPrice,
      expectedBrand,
      expectedCondition: 'NEW',
      expectedBuyingFormat: 'BIN'
    }
  });

  return action.id;
}

export async function createActionForDecision(db: PrismaClient, input: CreateActionInput): Promise<string | undefined> {
  const type = actionTypeForDecision(input.decision.decision);
  if (!type) return undefined;

  if (type === 'VERIFY') {
    if (!hasTransaction(db)) return createVerificationActionRows(db, input, type);
    const transactionalDb = db as unknown as { $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> };
    return transactionalDb.$transaction((tx) => createVerificationActionRows(tx, input, type));
  }

  const priority = 50;
  const action = await db.actionItem.create({
    data: {
      productCandidateId: input.productCandidateId,
      amazonMatchId: input.amazonMatchId,
      type,
      priority,
      reason: input.decision.reasoningSummary,
      payloadJson: decisionPayload(input.decision)
    }
  });

  return action.id;
}

export async function listActionItems(db: PrismaClient, status = 'PENDING'): Promise<unknown[]> {
  return db.actionItem.findMany({
    where: {
      status,
      ...(status === 'APPROVED'
        ? {
            automationRuns: {
              none: { status: { in: ['RUNNING', 'NEEDS_HUMAN_CONFIRMATION'] } }
            }
          }
        : {})
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: 100
  });
}

export async function updateActionStatus(
  db: PrismaClient,
  id: string,
  status: 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'ERROR',
  reviewedBy?: string
): Promise<unknown> {
  const existing = await db.actionItem.findUnique({ where: { id } });
  if (!existing) throw notFound('Action not found', 'ACTION_NOT_FOUND');
  if (existing.status === status) return existing;

  const terminalStatuses = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);
  if (terminalStatuses.has(existing.status)) {
    throw conflict(`Cannot change action status from ${existing.status} to ${status}`, 'ACTION_TERMINAL_STATUS');
  }

  if (status === 'COMPLETED' && existing.type !== 'REVIEW') {
    throw conflict('Only REVIEW actions can be completed manually. Use the execution or verification endpoint for marketplace actions.', 'ACTION_COMPLETION_REQUIRES_EXECUTION');
  }

  if (existing.status === 'PENDING' && !['APPROVED', 'REJECTED', 'CANCELLED', 'ERROR'].includes(status)) {
    throw conflict(`Cannot change action status from ${existing.status} to ${status}`, 'ACTION_INVALID_STATUS_TRANSITION');
  }

  if (existing.status === 'APPROVED' && !['COMPLETED', 'REJECTED', 'CANCELLED', 'ERROR'].includes(status)) {
    throw conflict(`Cannot change action status from ${existing.status} to ${status}`, 'ACTION_INVALID_STATUS_TRANSITION');
  }

  if (existing.status === 'ERROR' && !['APPROVED', 'CANCELLED'].includes(status)) {
    throw conflict(`Cannot change action status from ${existing.status} to ${status}`, 'ACTION_INVALID_STATUS_TRANSITION');
  }

  const actor = reviewedBy ?? 'dashboard';
  return db.$transaction(async (tx) => {
    const updated = await tx.actionItem.update({
      where: { id },
      data: {
        status,
        reviewedBy: actor,
        reviewedAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        entityType: 'ActionItem',
        entityId: id,
        action: 'ACTION_STATUS_CHANGED',
        actor,
        beforeJson: { status: existing.status },
        afterJson: { status, type: existing.type }
      }
    });

    return updated;
  });
}
