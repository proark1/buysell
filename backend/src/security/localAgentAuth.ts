import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getConfiguredLocalAgentSecrets, verifyDashboardSessionRequest } from './dashboardSession.js';

const headerValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

// HMAC timestamps must be within this window, and each nonce is single-use within it.
const hmacWindowMs = 90 * 1000;

const seenNonces = new Map<string, number>();

const pruneNonces = (now: number): void => {
  if (seenNonces.size < 2_000) return;
  for (const [nonce, expiresAt] of seenNonces.entries()) {
    if (expiresAt <= now) seenNonces.delete(nonce);
  }
};

const hashSecret = (value: string): Buffer => createHash('sha256').update(value).digest();

// Constant-time compare of two hex strings via fixed-width SHA-256 digests, so the
// comparison never short-circuits on length and cannot leak the expected signature.
const constantTimeEqual = (a: string, b: string): boolean => timingSafeEqual(hashSecret(a), hashSecret(b));

const bodyHash = (body: unknown): string => createHash('sha256')
  .update(body === undefined ? '' : JSON.stringify(body))
  .digest('hex');

const requestMethod = (request: FastifyRequest): string => {
  const raw = request as unknown as { method?: string; raw?: { method?: string } };
  return raw.method ?? raw.raw?.method ?? 'GET';
};

const requestUrl = (request: FastifyRequest): string => {
  const raw = request as unknown as { url?: string; raw?: { url?: string } };
  return raw.url ?? raw.raw?.url ?? '/';
};

const hmacMessage = (request: FastifyRequest, timestamp: string, nonce: string): string => [
  timestamp,
  nonce,
  requestMethod(request).toUpperCase(),
  requestUrl(request),
  bodyHash(request.body)
].join('\n');

const signatureMatches = (request: FastifyRequest, timestamp: string, nonce: string, signature: string, configured: string): boolean => {
  const expected = createHmac('sha256', configured).update(hmacMessage(request, timestamp, nonce)).digest('hex');
  return constantTimeEqual(signature, expected);
};

export async function verifyLocalAgentRequest(
  db: PrismaClient,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const method = requestMethod(request).toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (await verifyDashboardSessionRequest(db, request, { requireCsrf: isMutation })) return true;

  const configuredSecrets = await getConfiguredLocalAgentSecrets(db);

  if (configuredSecrets.length === 0) {
    reply.status(503).send({
      error: 'Protected routes require LOCAL_AGENT_SHARED_SECRET to be configured before use.',
      code: 'LOCAL_AGENT_AUTH_NOT_CONFIGURED'
    });
    return false;
  }

  const timestamp = headerValue(request.headers['x-local-agent-timestamp']);
  const signature = headerValue(request.headers['x-local-agent-signature']);
  const nonce = headerValue(request.headers['x-local-agent-nonce']);
  const timestampMs = Number(timestamp);

  if (timestamp && signature && nonce && Number.isFinite(timestampMs)) {
    const now = Date.now();
    if (Math.abs(now - timestampMs) <= hmacWindowMs
      && configuredSecrets.some((secret) => signatureMatches(request, timestamp, nonce, signature, secret))) {
      pruneNonces(now);
      if (seenNonces.has(nonce)) {
        reply.status(401).send({ error: 'Replayed local agent request', code: 'LOCAL_AGENT_REPLAY' });
        return false;
      }
      seenNonces.set(nonce, now + hmacWindowMs);
      return true;
    }
  }

  reply.status(401).send({ error: 'Invalid or missing local agent signature' });
  return false;
}
