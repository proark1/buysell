import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import {
  addAutomationEvent,
  automationEventLevels,
  automationModes,
  automationRunStatuses,
  createAutomationRun,
  defaultAutomationModeForAction,
  finishAutomationRun,
  listAutomationRuns
} from '../services/automation.js';

const actionParamsSchema = z.object({ id: z.string().min(1) });
const runParamsSchema = z.object({ id: z.string().min(1) });

const startAutomationBodySchema = z.object({
  mode: z.enum(automationModes).optional(),
  agentType: z.string().min(1).max(80).optional(),
  phase: z.string().min(1).max(80).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
  metadata: z.record(z.unknown()).optional()
}).default({});

const setAutomationModeBodySchema = z.object({
  mode: z.enum(automationModes),
  approve: z.boolean().default(true),
  reviewedBy: z.string().min(1).max(80).default('dashboard')
});

const addEventBodySchema = z.object({
  eventType: z.string().min(1).max(80),
  message: z.string().min(1).max(1000),
  level: z.enum(automationEventLevels).optional(),
  data: z.record(z.unknown()).optional()
});

const finishRunBodySchema = z.object({
  status: z.enum(automationRunStatuses),
  phase: z.string().min(1).max(80).optional(),
  result: z.record(z.unknown()).optional(),
  error: z.string().min(1).max(2000).optional(),
  eventType: z.string().min(1).max(80).optional(),
  message: z.string().min(1).max(1000).optional()
});

const listRunsQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(50)
});

export async function registerAutomationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/automation/runs', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const parsed = listRunsQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid automation runs query', details: parsed.error.flatten() });
    }

    return { runs: await listAutomationRuns(prisma, parsed.data.take) };
  });

  app.post('/actions/:id/automation-runs', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = actionParamsSchema.safeParse(request.params);
    const body = startAutomationBodySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid automation start request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    const action = await prisma.actionItem.findUnique({ where: { id: params.data.id } });
    if (!action) return reply.status(404).send({ error: 'Action not found' });

    const run = await createAutomationRun(prisma, {
      actionItemId: action.id,
      mode: body.data.mode ?? defaultAutomationModeForAction(action),
      agentType: body.data.agentType,
      phase: body.data.phase,
      riskScore: body.data.riskScore,
      metadata: body.data.metadata
    });

    return { run };
  });

  app.patch('/actions/:id/automation-mode', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = actionParamsSchema.safeParse(request.params);
    const body = setAutomationModeBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid automation mode request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    const action = await prisma.actionItem.findUnique({ where: { id: params.data.id } });
    if (!action) return reply.status(404).send({ error: 'Action not found' });

    const existingPayload = action.payloadJson && typeof action.payloadJson === 'object' && !Array.isArray(action.payloadJson)
      ? action.payloadJson as Record<string, unknown>
      : {};
    const updated = await prisma.actionItem.update({
      where: { id: action.id },
      data: {
        status: body.data.approve ? 'APPROVED' : action.status,
        reviewedBy: body.data.approve ? body.data.reviewedBy : action.reviewedBy,
        reviewedAt: body.data.approve ? new Date() : action.reviewedAt,
        payloadJson: {
          ...existingPayload,
          automationMode: body.data.mode,
          automationModeQueuedAt: new Date().toISOString(),
          automationModeQueuedBy: body.data.reviewedBy
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'ActionItem',
        entityId: action.id,
        action: 'AUTOMATION_MODE_QUEUED',
        actor: body.data.reviewedBy,
        beforeJson: { status: action.status, automationMode: existingPayload.automationMode },
        afterJson: { status: updated.status, automationMode: body.data.mode }
      }
    });

    return { action: updated };
  });

  app.post('/automation-runs/:id/events', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = runParamsSchema.safeParse(request.params);
    const body = addEventBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid automation event request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    const event = await addAutomationEvent(prisma, {
      runId: params.data.id,
      eventType: body.data.eventType,
      message: body.data.message,
      level: body.data.level,
      data: body.data.data
    });

    return { event };
  });

  app.patch('/automation-runs/:id', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = runParamsSchema.safeParse(request.params);
    const body = finishRunBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: 'Invalid automation run update request',
        details: {
          params: params.success ? undefined : params.error.flatten(),
          body: body.success ? undefined : body.error.flatten()
        }
      });
    }

    const run = await finishAutomationRun(prisma, {
      runId: params.data.id,
      status: body.data.status,
      phase: body.data.phase,
      result: body.data.result,
      error: body.data.error,
      eventType: body.data.eventType,
      message: body.data.message
    });

    return { run };
  });
}
