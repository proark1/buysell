import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { verifyLocalAgentRequest } from './localAgentAuth.js';

type ReplyState = {
  statusCode?: number;
  payload?: unknown;
};

const requestWithSecret = (secret?: string): FastifyRequest => ({
  headers: secret ? { 'x-local-agent-secret': secret } : {}
}) as FastifyRequest;

const requestWithSignature = (secret: string, input: { method: string; url: string; body?: unknown; timestamp?: string }): FastifyRequest => {
  const timestamp = input.timestamp ?? String(Date.now());
  const bodyHash = createHash('sha256')
    .update(input.body === undefined ? '' : JSON.stringify(input.body))
    .digest('hex');
  const signature = createHmac('sha256', secret)
    .update([timestamp, input.method.toUpperCase(), input.url, bodyHash].join('\n'))
    .digest('hex');
  return {
    method: input.method,
    url: input.url,
    body: input.body,
    headers: {
      'x-local-agent-timestamp': timestamp,
      'x-local-agent-signature': signature
    }
  } as FastifyRequest;
};

const replyState = (): { reply: FastifyReply; state: ReplyState } => {
  const state: ReplyState = {};
  const reply = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      state.payload = payload;
      return this;
    }
  } as FastifyReply;
  return { reply, state };
};

const dbWithStoredSecret = (secret?: string): unknown => ({
  credential: {
    findUnique: async () => secret ? { encryptedValue: secret } : null
  }
});

const plainDbWithSecret = (secret?: string): unknown => ({
  credential: {
    findUnique: async () => secret ? { encryptedValue: secret } : null
  }
});

const originalSecret = env.LOCAL_AGENT_SHARED_SECRET;

try {
  env.LOCAL_AGENT_SHARED_SECRET = 'env-secret';
  {
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(plainDbWithSecret() as never, requestWithSecret('env-secret'), reply);
    if (!ok) throw new Error('env secret should authorize request');
    if (state.statusCode !== undefined) throw new Error('authorized request should not set status');
  }

  {
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(
      plainDbWithSecret() as never,
      requestWithSignature('env-secret', { method: 'POST', url: '/actions/action-1/execute', body: { actor: 'local-agent' } }),
      reply
    );
    if (!ok) throw new Error('signed request should authorize request');
    if (state.statusCode !== undefined) throw new Error('authorized signed request should not set status');
  }

  {
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(plainDbWithSecret() as never, requestWithSecret('wrong'), reply);
    if (ok) throw new Error('wrong secret should not authorize request');
    if (state.statusCode !== 401) throw new Error(`wrong secret should return 401, got ${state.statusCode}`);
  }

  env.LOCAL_AGENT_SHARED_SECRET = undefined;
  {
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(plainDbWithSecret() as never, requestWithSecret(), reply);
    if (ok) throw new Error('missing configured secret should not authorize request');
    if (state.statusCode !== 503) throw new Error(`missing configured secret should return 503, got ${state.statusCode}`);
  }

  // Simulate the encrypted credential repository failing open only after a stored
  // secret has been configured. The auth layer should still require a matching
  // caller-provided header.
  {
    const { encryptJson } = await import('./encryption.js');
    const db = dbWithStoredSecret(encryptJson('stored-secret'));
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(db as never, requestWithSecret('stored-secret'), reply);
    if (!ok) throw new Error('stored local agent secret should authorize request');
    if (state.statusCode !== undefined) throw new Error('authorized stored-secret request should not set status');
  }

  console.log('localAgentAuth unit test passed');
} finally {
  env.LOCAL_AGENT_SHARED_SECRET = originalSecret;
}
