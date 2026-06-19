import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { listActionItems, updateActionStatus } from '../repositories/actionRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import { executeAction } from '../services/actionExecutor.js';
import { submitPriceVerificationResult } from '../services/priceVerification.js';

const listActionsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'ERROR']).default('PENDING')
});

const updateActionParamsSchema = z.object({ id: z.string().min(1) });
const updateActionBodySchema = z.object({
  status: z.enum(['APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'ERROR']),
  reviewedBy: z.string().min(1).optional()
});

const executeActionBodySchema = z.object({
  actor: z.string().min(1).optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
  result: z.record(z.unknown()).optional()
}).default({});

const verificationObservationSchema = z.object({
  observedPrice: z.number().positive().optional(),
  brand: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  buyingFormat: z.string().min(1).optional(),
  url: z.string().url().optional(),
  screenshotPath: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
});

const verificationResultBodySchema = z.object({
  status: z.enum(['PASSED', 'FAILED', 'MANUAL_REVIEW']).optional(),
  amazon: verificationObservationSchema.optional(),
  ebay: verificationObservationSchema.optional(),
  evidence: z.record(z.unknown()).optional(),
  failureReasons: z.array(z.string().min(1)).optional(),
  checkedBy: z.string().min(1).optional()
});

const feedbackBodySchema = z.object({
  feedbackType: z.enum(['APPROVE', 'REJECT', 'NEEDS_REVIEW', 'BAD_MATCH', 'BAD_ECONOMICS', 'BAD_SOURCE', 'GOOD_OPPORTUNITY']),
  reasonCode: z.string().min(1).max(80).optional(),
  reasonText: z.string().min(1).max(1000).optional(),
  weight: z.number().int().min(-5).max(5).default(1)
});

export async function registerActionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/actions', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = listActionsQuerySchema.safeParse(request.query ?? {});

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid action list query', details: parsed.error.flatten() });
    }

    return { actions: await listActionItems(prisma, parsed.data.status) };
  });



  app.post('/actions/:id/execute', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = updateActionParamsSchema.safeParse(request.params);
    const body = executeActionBodySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid action execute request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    return { result: await executeAction(prisma, params.data.id, body.data) };
  });

  app.post('/actions/:id/verification-result', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = updateActionParamsSchema.safeParse(request.params);
    const body = verificationResultBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid verification result request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    return { result: await submitPriceVerificationResult(prisma, params.data.id, body.data) };
  });

  app.patch('/actions/:id', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = updateActionParamsSchema.safeParse(request.params);
    const body = updateActionBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid action update request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    return { action: await updateActionStatus(prisma, params.data.id, body.data.status, body.data.reviewedBy) };
  });

  app.post('/actions/:id/feedback', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = updateActionParamsSchema.safeParse(request.params);
    const body = feedbackBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid action feedback request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    const action = await prisma.actionItem.findUnique({ where: { id: params.data.id } });
    if (!action) return reply.status(404).send({ error: 'Action not found' });

    const feedback = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunityFeedback.create({
        data: {
          productCandidateId: action.productCandidateId,
          amazonMatchId: action.amazonMatchId,
          feedbackType: body.data.feedbackType,
          reasonCode: body.data.reasonCode,
          reasonText: body.data.reasonText,
          source: 'dashboard',
          weight: body.data.weight,
          metadataJson: {
            actionItemId: action.id,
            actionType: action.type,
            actionStatus: action.status
          }
        }
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ActionItem',
          entityId: action.id,
          action: 'ACTION_FEEDBACK_RECORDED',
          actor: 'dashboard',
          afterJson: {
            feedbackId: created.id,
            feedbackType: body.data.feedbackType,
            reasonCode: body.data.reasonCode
          }
        }
      });

      return created;
    });

    return { feedback };
  });
}
