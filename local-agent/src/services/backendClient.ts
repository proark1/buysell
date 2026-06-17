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
}

const headers = (sharedSecret?: string): Record<string, string> => {
  const base: Record<string, string> = { 'content-type': 'application/json' };
  if (sharedSecret) base['x-local-agent-secret'] = sharedSecret;
  return base;
};

export async function fetchApprovedActions(options: BackendClientOptions): Promise<ActionItemDto[]> {
  const response = await fetch(`${options.backendUrl}/actions?status=APPROVED`, {
    headers: headers(options.sharedSecret)
  });

  if (!response.ok) {
    throw new Error(`Backend action fetch failed with status ${response.status}`);
  }

  const payload = await response.json() as { actions?: ActionItemDto[] };
  return payload.actions ?? [];
}

export async function completeAction(options: BackendClientOptions, actionId: string): Promise<void> {
  const response = await fetch(`${options.backendUrl}/actions/${actionId}`, {
    method: 'PATCH',
    headers: headers(options.sharedSecret),
    body: JSON.stringify({ status: 'COMPLETED', reviewedBy: 'local-agent' })
  });

  if (!response.ok) {
    throw new Error(`Backend action update failed with status ${response.status}`);
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
  const response = await fetch(`${options.backendUrl}/actions/${actionId}/automation-runs`, {
    method: 'POST',
    headers: headers(options.sharedSecret),
    body: JSON.stringify(input)
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
  const response = await fetch(`${options.backendUrl}/automation-runs/${runId}/events`, {
    method: 'POST',
    headers: headers(options.sharedSecret),
    body: JSON.stringify(input)
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
  const response = await fetch(`${options.backendUrl}/automation-runs/${runId}`, {
    method: 'PATCH',
    headers: headers(options.sharedSecret),
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Backend automation finish failed with status ${response.status}`);
  }
}

export async function submitVerificationResult(options: BackendClientOptions, actionId: string, result: VerificationResultDto): Promise<void> {
  const response = await fetch(`${options.backendUrl}/actions/${actionId}/verification-result`, {
    method: 'POST',
    headers: headers(options.sharedSecret),
    body: JSON.stringify(result)
  });

  if (!response.ok) {
    throw new Error(`Backend verification result update failed with status ${response.status}`);
  }
}
