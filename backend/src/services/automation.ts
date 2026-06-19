import type { PrismaClient } from '@prisma/client';
import { conflict, notFound } from '../security/httpErrors.js';
import { notify } from './notificationService.js';
import { getActiveRuleConfig } from '../repositories/ruleConfigRepository.js';

/**
 * After a failed run, either dead-letter the action (status ERROR) once it has exhausted
 * maxAutomationAttempts, or schedule a backoff window so the local agent stops re-polling
 * a reliably-failing action every cycle.
 */
async function applyAutomationFailureBackoff(db: PrismaClient, actionItemId: string, priorAttempts: number, error?: string): Promise<void> {
  const config = await getActiveRuleConfig(db);
  const attempts = priorAttempts + 1;
  if (attempts >= config.maxAutomationAttempts) {
    await db.actionItem.updateMany({
      where: { id: actionItemId, status: { in: ['APPROVED', 'EXECUTING'] } },
      data: { status: 'ERROR', automationAttempts: attempts, nextAttemptAt: null }
    });
    notify(db, {
      code: 'ACTION_DEAD_LETTERED',
      severity: 'high',
      title: 'Action moved to manual intervention',
      message: `Action ${actionItemId} failed ${attempts} times and was set to ERROR.${error ? ` Last error: ${error}` : ''}`,
      data: { actionItemId, attempts }
    });
    return;
  }
  const backoffMs = Math.min(30, 2 ** attempts) * 60_000;
  await db.actionItem.update({
    where: { id: actionItemId },
    data: { automationAttempts: attempts, nextAttemptAt: new Date(Date.now() + backoffMs) }
  });
}

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

interface AutomationArtifactInput {
  kind: string;
  path?: string;
  url?: string;
  sha256?: string;
  metadataJson?: Record<string, unknown>;
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

const prismaErrorCode = (error: unknown): string | undefined => (
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
);

const latestActiveRun = (db: PrismaClient, actionItemId: string): Promise<unknown> => db.automationRun.findFirst({
  where: {
    actionItemId,
    status: { in: [...activeAutomationStatuses] }
  },
  orderBy: { startedAt: 'desc' }
});

const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined;

function artifactFromRecord(record: Record<string, unknown>, fallbackKind: string): AutomationArtifactInput | undefined {
  const path = stringValue(record.path) ?? stringValue(record.filePath) ?? stringValue(record.screenshotPath);
  const url = stringValue(record.url);
  if (!path && !url) return undefined;
  return {
    kind: stringValue(record.kind) ?? fallbackKind,
    path,
    url,
    sha256: stringValue(record.sha256),
    metadataJson: {
      label: stringValue(record.label) ?? stringValue(record.name),
      source: stringValue(record.source)
    }
  };
}

function collectAutomationArtifacts(value: unknown, out: AutomationArtifactInput[] = [], path: string[] = []): AutomationArtifactInput[] {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectAutomationArtifacts(item, out, path);
    return out;
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.artifacts)) {
    for (const artifact of record.artifacts) {
      const parsed = artifact && typeof artifact === 'object' && !Array.isArray(artifact)
        ? artifactFromRecord(artifact as Record<string, unknown>, 'ARTIFACT')
        : undefined;
      if (parsed) out.push(parsed);
    }
  }

  for (const [key, item] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    const kind = [...path, key].join('.').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    if ((lowerKey.endsWith('screenshotpath') || lowerKey.endsWith('artifactpath')) && typeof item === 'string') {
      out.push({ kind, path: item, metadataJson: { jsonPath: [...path, key].join('.') } });
      continue;
    }
    if ((lowerKey.endsWith('screenshoturl') || lowerKey.endsWith('artifacturl')) && typeof item === 'string') {
      out.push({ kind, url: item, metadataJson: { jsonPath: [...path, key].join('.') } });
      continue;
    }
    collectAutomationArtifacts(item, out, [...path, key]);
  }

  return out;
}

export function automationArtifactsFromResult(result: Record<string, unknown> | undefined): AutomationArtifactInput[] {
  return collectAutomationArtifacts(result)
    .filter((artifact, index, all) => all.findIndex((item) => item.path === artifact.path && item.url === artifact.url && item.kind === artifact.kind) === index);
}

async function persistAutomationArtifacts(db: PrismaClient, runId: string, actionItemId: string, result: Record<string, unknown> | undefined): Promise<void> {
  const artifacts = automationArtifactsFromResult(result);
  if (!artifacts.length) return;

  await db.automationArtifact.createMany({
    data: artifacts.map((artifact) => ({
      automationRunId: runId,
      actionItemId,
      kind: artifact.kind,
      path: artifact.path,
      url: artifact.url,
      sha256: artifact.sha256,
      metadataJson: artifact.metadataJson
    }))
  });
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

  if (!action) throw notFound('Action not found', 'ACTION_NOT_FOUND');
  if (action.status !== 'APPROVED') throw conflict('Action must be APPROVED before automation can run', 'ACTION_NOT_APPROVED');

  const existing = action.automationRuns[0];
  if (existing) return existing;

  const riskScore = input.riskScore ?? automationRiskScore(action, input.mode);
  let run;
  try {
    run = await db.automationRun.create({
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
  } catch (error) {
    if (prismaErrorCode(error) === 'P2002') {
      const active = await latestActiveRun(db, action.id);
      if (active) return active;
    }
    throw error;
  }

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
  const run = await db.automationRun.findUnique({ where: { id: input.runId } });
  if (!run) throw notFound('Automation run not found', 'AUTOMATION_RUN_NOT_FOUND');

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
  const existing = await db.automationRun.findUnique({ where: { id: input.runId } });
  if (!existing) throw notFound('Automation run not found', 'AUTOMATION_RUN_NOT_FOUND');

  // A run that already reached a terminal state must not be overwritten or resurrected
  // (e.g. a late duplicate finish replacing a COMPLETED run's result).
  if (isTerminalAutomationStatus(existing.status)) {
    throw conflict('Automation run is already finalized', 'AUTOMATION_RUN_FINALIZED');
  }

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

  await persistAutomationArtifacts(db, run.id, run.actionItemId, input.result);

  if (input.status === 'FAILED' || input.status === 'REVIEW_REQUIRED') {
    notify(db, {
      code: `AUTOMATION_${input.status}`,
      severity: input.status === 'FAILED' ? 'high' : 'medium',
      title: `Automation run ${input.status === 'FAILED' ? 'failed' : 'needs review'}`,
      message: input.message ?? input.error ?? `Automation run ${input.runId} is ${input.status}.`,
      data: { runId: input.runId, actionItemId: run.actionItemId, actionType: run.actionItem.type, mode: run.mode }
    });
  }

  if (input.status === 'FAILED') {
    await applyAutomationFailureBackoff(db, run.actionItemId, run.actionItem.automationAttempts, input.error);
  }

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
      },
      artifacts: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });
}
