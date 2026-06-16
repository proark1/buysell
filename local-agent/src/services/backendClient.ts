export interface ActionItemDto {
  id: string;
  type: 'LIST' | 'REPRICE' | 'PAUSE' | 'BUY' | 'REVIEW';
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'ERROR';
  reason: string;
  orderId?: string;
  payloadJson?: unknown;
}

export interface BackendClientOptions {
  backendUrl: string;
  sharedSecret?: string;
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
