import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import type { PrismaClient } from '@prisma/client';
import { getCredentialValue } from '../repositories/credentialRepository.js';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const headerValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const hashSecret = (value: string): Buffer => createHash('sha256').update(value).digest();

const secretMatches = (provided: string, configured: string): boolean => {
  const providedHash = hashSecret(provided);
  const configuredHash = hashSecret(configured);
  return provided.length === configured.length && timingSafeEqual(providedHash, configuredHash);
};

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

const hmacMessage = (request: FastifyRequest, timestamp: string): string => [
  timestamp,
  requestMethod(request).toUpperCase(),
  requestUrl(request),
  bodyHash(request.body)
].join('\n');

const signatureMatches = (request: FastifyRequest, configured: string): boolean => {
  const timestamp = headerValue(request.headers['x-local-agent-timestamp']);
  const signature = headerValue(request.headers['x-local-agent-signature']);
  if (!timestamp || !signature) return false;

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;

  const expected = createHmac('sha256', configured).update(hmacMessage(request, timestamp)).digest('hex');
  const providedHash = hashSecret(signature);
  const expectedHash = hashSecret(expected);
  return signature.length === expected.length && timingSafeEqual(providedHash, expectedHash);
};

export async function verifyLocalAgentRequest(
  db: PrismaClient,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const configuredSecrets = [
    env.LOCAL_AGENT_SHARED_SECRET,
    await getCredentialValue(db, 'LOCAL_AGENT_SHARED_SECRET')
  ].filter((value): value is string => Boolean(value));

  if (configuredSecrets.length === 0) {
    reply.status(503).send({
      error: 'Protected routes require LOCAL_AGENT_SHARED_SECRET to be configured before use.',
      code: 'LOCAL_AGENT_AUTH_NOT_CONFIGURED'
    });
    return false;
  }

  const providedSecret = headerValue(request.headers['x-local-agent-secret']);
  if (configuredSecrets.some((secret) => signatureMatches(request, secret))) return true;
  if (providedSecret && configuredSecrets.some((secret) => secretMatches(providedSecret, secret))) return true;

  reply.status(401).send({ error: 'Invalid or missing local agent secret' });
  return false;
}
