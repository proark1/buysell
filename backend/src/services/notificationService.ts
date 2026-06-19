import type { PrismaClient } from '@prisma/client';
import { getSecret } from './secrets.js';
import { fetchWithTimeout } from '../clients/httpClient.js';

export type NotificationSeverity = 'low' | 'medium' | 'high';

export interface NotificationEvent {
  code: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * POST a notification to the operator-configured webhook (Credential
 * NOTIFICATION_WEBHOOK_URL). Best-effort: never throws into the caller, and only
 * https:// targets are honored to avoid SSRF to internal services.
 */
export async function sendNotification(db: PrismaClient, event: NotificationEvent): Promise<void> {
  try {
    const url = await getSecret(db, 'NOTIFICATION_WEBHOOK_URL');
    if (!url || !/^https:\/\//i.test(url)) return;
    await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'buysell', sentAt: new Date().toISOString(), ...event }),
      timeoutMs: 8_000
    });
  } catch {
    // A notification failure must never break the primary operation.
  }
}

/** Fire-and-forget convenience wrapper. */
export function notify(db: PrismaClient, event: NotificationEvent): void {
  void sendNotification(db, event);
}
