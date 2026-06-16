import type { PrismaClient } from '@prisma/client';
import type { OpportunityDecision } from '../domain/products.js';

export interface CreateActionInput {
  productCandidateId?: string;
  amazonMatchId?: string;
  decision: OpportunityDecision;
}

const actionTypeForDecision = (decision: OpportunityDecision['decision']): 'LIST' | 'REPRICE' | 'PAUSE' | 'REVIEW' | undefined => {
  if (decision === 'LIST') return 'LIST';
  if (decision === 'REPRICE') return 'REPRICE';
  if (decision === 'PAUSE') return 'PAUSE';
  if (decision === 'MANUAL_REVIEW') return 'REVIEW';
  return undefined;
};

export async function createActionForDecision(db: PrismaClient, input: CreateActionInput): Promise<string | undefined> {
  const type = actionTypeForDecision(input.decision.decision);
  if (!type) return undefined;

  const priority = type === 'LIST' ? 20 : 50;
  const action = await db.actionItem.create({
    data: {
      productCandidateId: input.productCandidateId,
      amazonMatchId: input.amazonMatchId,
      type,
      priority,
      reason: input.decision.reasoningSummary,
      payloadJson: {
        decision: input.decision.decision,
        confidence: input.decision.confidence,
        riskFlags: input.decision.riskFlags,
        recommendedPrice: input.decision.recommendedPrice,
        recommendedTitle: input.decision.recommendedTitle,
        recommendedDescription: input.decision.recommendedDescription
      }
    }
  });

  return action.id;
}

export async function listActionItems(db: PrismaClient, status = 'PENDING'): Promise<unknown[]> {
  return db.actionItem.findMany({
    where: { status },
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
  return db.actionItem.update({
    where: { id },
    data: {
      status,
      reviewedBy,
      reviewedAt: new Date()
    }
  });
}
