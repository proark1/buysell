import type { PrismaClient } from '@prisma/client';

export const automationModes = ['VERIFY', 'DRAFT', 'ASSISTED', 'AUTOPILOT'] as const;
export const automationRunStatuses = ['RUNNING', 'NEEDS_HUMAN_CONFIRMATION', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'CANCELLED'] as const;
export const automationEventLevels = ['INFO', 'WARN', 'ERROR'] as const;

export type AutomationMode = (typeof automationModes)[number];
export type AutomationRunStatus = (typeof automationRunStatuses)[number];
export type AutomationEventLevel = (typeof automationEventLevels)[number];

export interface CreateAutomationRunInput {
  actionItemId: string;
  mode: AutomationMode;
  agentType?: string;
  phase?: string;
  riskScore?: number;
  metadata?: Record<string, unknown>;
}

export interface AddAutomationEventInput {
  runId: string;
  eventType: string;
  message: string;
  level?: AutomationEventLevel;
  data?: Record<string, unknown>;
}

export interface FinishAutomationRunInput {
  runId: string;
  status: AutomationRunStatus;
  phase?: string;
  result?: Record<string, unknown>;
  error?: string;
  eventType?: string;
  message?: string;
}

const activeAutomationStatuses = ['RUNNING', 'NEEDS_HUMAN_CONFIRMATION'] as const;

interface ActionTypeOnly {
  type: 'LIST' | 'REPRICE' | 'PAUSE' | 'BUY' | 'REVIEW' | 'VERIFY';
}

export function defaultAutomationModeForAction(action: ActionTypeOnly): AutomationMode {
  if (action.type === 'VERIFY') return 'VERIFY';
  if (action.type === 'BUY') return 'ASSISTED';
  return 'DRAFT';
}

export function automationRiskScore(action: ActionTypeOnly, mode: AutomationMode): number {
  if (mode === 'AUTOPILOT') return action.type === 'BUY' ? 95 : 85;
  if (mode === 'ASSISTED') return action.type === 'BUY' ? 75 : 60;
  if (mode === 'DRAFT') return action.type === 'BUY' ? 65 : 35;
  return 20;
}

export function isTerminalAutomationStatus(status: string): boolean {
  return !activeAutomationStatuses.includes(status as (typeof activeAutomationStatuses)[number]);
}

export async function createAutomationRun(db: PrismaClient, input: CreateAutomationRunInput): Promise<unknown> {
  const action = await db.actionItem.findUnique({
    where: { id: input.actionItemId },
    include: {
      automationRuns: {
        where: { status: { in: [...activeAutomationStatuses] } },
        orderBy: { startedAt: 'desc' },
        take: 1
      }
    }
  });

  if (!action) throw new Error('Action not found');
  if (action.status !== 'APPROVED') throw new Error('Action must be APPROVED before automation can run');

  const existing = action.automationRuns[0];
  if (existing) return existing;

  const riskScore = input.riskScore ?? automationRiskScore(action, input.mode);
  const run = await db.automationRun.create({
    data: {
      actionItemId: action.id,
      mode: input.mode,
      agentType: input.agentType ?? 'local-agent',
      phase: input.phase ?? 'STARTED',
      riskScore,
      resultJson: input.metadata ? { metadata: input.metadata } : undefined,
      events: {
        create: {
          eventType: 'AUTOMATION_STARTED',
          message: `${input.mode} automation started for ${action.type} action`,
          dataJson: {
            actionType: action.type,
            riskScore,
            metadata: input.metadata
          }
        }
      }
    }
  });

  await db.auditLog.create({
    data: {
      entityType: 'AutomationRun',
      entityId: run.id,
      action: 'AUTOMATION_STARTED',
      actor: input.agentType ?? 'local-agent',
      afterJson: {
        actionItemId: action.id,
        actionType: action.type,
        mode: input.mode,
        riskScore
      }
    }
  });

  return run;
}

export async function addAutomationEvent(db: PrismaClient, input: AddAutomationEventInput): Promise<unknown> {
  return db.automationEvent.create({
    data: {
      automationRunId: input.runId,
      level: input.level ?? 'INFO',
      eventType: input.eventType,
      message: input.message,
      dataJson: input.data
    }
  });
}

export async function finishAutomationRun(db: PrismaClient, input: FinishAutomationRunInput): Promise<unknown> {
  const completedAt = isTerminalAutomationStatus(input.status) ? new Date() : undefined;
  const run = await db.automationRun.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      phase: input.phase ?? input.status,
      resultJson: input.result,
      error: input.error,
      completedAt,
      events: input.message
        ? {
            create: {
              level: input.status === 'FAILED' ? 'ERROR' : input.status === 'REVIEW_REQUIRED' ? 'WARN' : 'INFO',
              eventType: input.eventType ?? `AUTOMATION_${input.status}`,
              message: input.message,
              dataJson: input.result
            }
          }
        : undefined
    },
    include: { actionItem: true }
  });

  await db.auditLog.create({
    data: {
      entityType: 'AutomationRun',
      entityId: run.id,
      action: `AUTOMATION_${input.status}`,
      actor: run.agentType,
      afterJson: {
        actionItemId: run.actionItemId,
        actionType: run.actionItem.type,
        mode: run.mode,
        phase: run.phase,
        error: input.error
      }
    }
  });

  return run;
}

export async function listAutomationRuns(db: PrismaClient, take = 50): Promise<unknown[]> {
  return db.automationRun.findMany({
    orderBy: [{ startedAt: 'desc' }],
    take,
    include: {
      actionItem: {
        select: {
          id: true,
          type: true,
          status: true,
          priority: true,
          reason: true
        }
      },
      events: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  });
}
