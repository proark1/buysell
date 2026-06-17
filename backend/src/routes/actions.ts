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
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid action execute request', details: params.error.flatten() });
    }

    return { result: await executeAction(prisma, params.data.id) };
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
}
