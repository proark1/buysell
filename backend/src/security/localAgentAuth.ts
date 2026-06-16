import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

const headerValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

export function verifyLocalAgentRequest(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!env.LOCAL_AGENT_SHARED_SECRET) return true;

  const providedSecret = headerValue(request.headers['x-local-agent-secret']);
  if (providedSecret === env.LOCAL_AGENT_SHARED_SECRET) return true;

  reply.status(401).send({ error: 'Invalid or missing local agent secret' });
  return false;
}
