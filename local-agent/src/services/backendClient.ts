export interface ActionItemDto {
  id: string;
  type: 'VERIFY' | 'LIST' | 'REPRICE' | 'PAUSE' | 'BUY' | 'REVIEW';
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'ERROR';
  reason: string;
  orderId?: string;
  payloadJson?: unknown;
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
