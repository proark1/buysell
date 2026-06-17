import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import type { PrismaClient } from '@prisma/client';
import { getCredentialValue } from '../repositories/credentialRepository.js';
import { createHash, timingSafeEqual } from 'node:crypto';

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
  if (providedSecret && configuredSecrets.some((secret) => secretMatches(providedSecret, secret))) return true;

  reply.status(401).send({ error: 'Invalid or missing local agent secret' });
  return false;
}
