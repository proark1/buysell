import { createHash, createHmac } from 'node:crypto';

export interface ActionItemDto {
  id: string;
  type: 'VERIFY' | 'LIST' | 'REPRICE' | 'PAUSE' | 'BUY' | 'REVIEW';
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'ERROR';
  reason: string;
  orderId?: string;
  payloadJson?: unknown;
}

export type AutomationMode = 'VERIFY' | 'DRAFT' | 'ASSISTED' | 'AUTOPILOT';
export type AutomationRunStatus = 'RUNNING' | 'NEEDS_HUMAN_CONFIRMATION' | 'COMPLETED' | 'FAILED' | 'REVIEW_REQUIRED' | 'CANCELLED';
export type AutomationEventLevel = 'INFO' | 'WARN' | 'ERROR';

export interface AutomationRunDto {
  id: string;
  actionItemId: string;
  mode: AutomationMode;
  status: AutomationRunStatus;
  phase: string;
  riskScore: number;
  agentType: string;
}

export interface VerificationResultDto {
  status?: 'PASSED' | 'FAILED' | 'MANUAL_REVIEW';
  amazon?: {
    observedPrice?: number;
    brand?: string;
    title?: string;
    condition?: string;
    url?: string;
    screenshotPath?: string;
    notes?: string;
  };
  ebay?: {
    observedPrice?: number;
    brand?: string;
    title?: string;
    condition?: string;
    buyingFormat?: string;
    url?: string;
    screenshotPath?: string;
    notes?: string;
  };
  evidence?: Record<string, unknown>;
  failureReasons?: string[];
  checkedBy?: string;
}

export interface BackendClientOptions {
  backendUrl: string;
  sharedSecret?: string;
  computerUseVerifierCommand?: string;
  computerUseOperatorCommand?: string;
  computerUseDraftCommand?: string;
  computerUseAssistedCommand?: string;
  computerUseAutopilotCommand?: string;
  automationMode?: AutomationMode;
  computerUseTimeoutMs?: number;
  autoCompleteManualActions?: boolean;
  allowedDomains?: string[];
}

const bodyHash = (body?: string): string => createHash('sha256').update(body ?? '').digest('hex');

const headers = (input: {
  sharedSecret?: string;
  method: string;
  path: string;
  body?: string;
}): Record<string, string> => {
  const base: Record<string, string> = { 'content-type': 'application/json' };
  if (input.sharedSecret) {
    const timestamp = String(Date.now());
    const message = [
      timestamp,
      input.method.toUpperCase(),
      input.path,
      bodyHash(input.body)
    ].join('\n');
    base['x-local-agent-timestamp'] = timestamp;
    base['x-local-agent-signature'] = createHmac('sha256', input.sharedSecret).update(message).digest('hex');
    base['x-local-agent-secret'] = input.sharedSecret;
  }
  return base;
};

export async function fetchApprovedActions(options: BackendClientOptions): Promise<ActionItemDto[]> {
  const path = '/actions?status=APPROVED';
  const response = await fetch(`${options.backendUrl}${path}`, {
    headers: headers({ sharedSecret: options.sharedSecret, method: 'GET', path })
  });

  if (!response.ok) {
    throw new Error(`Backend action fetch failed with status ${response.status}`);
  }

  const payload = await response.json() as { actions?: ActionItemDto[] };
  return payload.actions ?? [];
}

export async function completeAction(options: BackendClientOptions, actionId: string): Promise<void> {
  const path = `/actions/${actionId}`;
  const body = JSON.stringify({ status: 'COMPLETED', reviewedBy: 'local-agent' });
  const response = await fetch(`${options.backendUrl}${path}`, {
    method: 'PATCH',
    headers: headers({ sharedSecret: options.sharedSecret, method: 'PATCH', path, body }),
    body
  });

  if (!response.ok) {
    throw new Error(`Backend action update failed with status ${response.status}`);
  }
}

export async function executeAction(
  options: BackendClientOptions,
  actionId: string,
  result?: Record<string, unknown>
): Promise<void> {
  const path = `/actions/${actionId}/execute`;
  const resultHash = createHash('sha256').update(JSON.stringify(result ?? {})).digest('hex').slice(0, 24);
  const body = JSON.stringify({ actor: 'local-agent', idempotencyKey: `local-agent-${actionId}-${resultHash}`, result });
  const response = await fetch(`${options.backendUrl}${path}`, {
    method: 'POST',
    headers: headers({ sharedSecret: options.sharedSecret, method: 'POST', path, body }),
    body
  });

  if (!response.ok) {
    throw new Error(`Backend action execution failed with status ${response.status}`);
  }
}

export async function startAutomationRun(
  options: BackendClientOptions,
  actionId: string,
  input: {
    mode: AutomationMode;
    agentType?: string;
    phase?: string;
    riskScore?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<AutomationRunDto> {
  const path = `/actions/${actionId}/automation-runs`;
  const body = JSON.stringify(input);
  const response = await fetch(`${options.backendUrl}${path}`, {
    method: 'POST',
    headers: headers({ sharedSecret: options.sharedSecret, method: 'POST', path, body }),
    body
  });

  if (!response.ok) {
    throw new Error(`Backend automation start failed with status ${response.status}`);
  }

  const payload = await response.json() as { run: AutomationRunDto };
  return payload.run;
}

export async function addAutomationEvent(
  options: BackendClientOptions,
  runId: string,
  input: {
    eventType: string;
    message: string;
    level?: AutomationEventLevel;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  const path = `/automation-runs/${runId}/events`;
  const body = JSON.stringify(input);
  const response = await fetch(`${options.backendUrl}${path}`, {
    method: 'POST',
    headers: headers({ sharedSecret: options.sharedSecret, method: 'POST', path, body }),
    body
  });

  if (!response.ok) {
    throw new Error(`Backend automation event failed with status ${response.status}`);
  }
}

export async function finishAutomationRun(
  options: BackendClientOptions,
  runId: string,
  input: {
    status: AutomationRunStatus;
    phase?: string;
    result?: Record<string, unknown>;
    error?: string;
    eventType?: string;
    message?: string;
  }
): Promise<void> {
  const path = `/automation-runs/${runId}`;
  const body = JSON.stringify(input);
  const response = await fetch(`${options.backendUrl}${path}`, {
    method: 'PATCH',
    headers: headers({ sharedSecret: options.sharedSecret, method: 'PATCH', path, body }),
    body
  });

  if (!response.ok) {
    throw new Error(`Backend automation finish failed with status ${response.status}`);
  }
}

export async function submitVerificationResult(options: BackendClientOptions, actionId: string, result: VerificationResultDto): Promise<void> {
  const path = `/actions/${actionId}/verification-result`;
  const body = JSON.stringify(result);
  const response = await fetch(`${options.backendUrl}${path}`, {
    method: 'POST',
    headers: headers({ sharedSecret: options.sharedSecret, method: 'POST', path, body }),
    body
  });

  if (!response.ok) {
    throw new Error(`Backend verification result update failed with status ${response.status}`);
  }
}
