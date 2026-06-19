import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { verifyLocalAgentRequest } from './localAgentAuth.js';

type ReplyState = {
  statusCode?: number;
  payload?: unknown;
};

const signedRequest = (
  secret: string,
  input: { method: string; url: string; body?: unknown; timestamp?: string; nonce?: string }
): FastifyRequest => {
  const timestamp = input.timestamp ?? String(Date.now());
  const nonce = input.nonce ?? randomUUID();
  const bodyHash = createHash('sha256')
    .update(input.body === undefined ? '' : JSON.stringify(input.body))
    .digest('hex');
  const signature = createHmac('sha256', secret)
    .update([timestamp, nonce, input.method.toUpperCase(), input.url, bodyHash].join('\n'))
    .digest('hex');
  return {
    method: input.method,
    url: input.url,
    body: input.body,
    headers: {
      'x-local-agent-timestamp': timestamp,
      'x-local-agent-nonce': nonce,
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

const dbWithStoredSecret = (encryptedValue?: string): unknown => ({
  credential: {
    findUnique: async () => encryptedValue ? { encryptedValue } : null
  }
});

const originalSecret = env.LOCAL_AGENT_SHARED_SECRET;

try {
  env.LOCAL_AGENT_SHARED_SECRET = 'env-secret';

  // A correctly HMAC-signed request authorizes against the environment secret.
  {
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(
      dbWithStoredSecret() as never,
      signedRequest('env-secret', { method: 'POST', url: '/actions/action-1/execute', body: { actor: 'local-agent' } }),
      reply
    );
    if (!ok) throw new Error('signed env-secret request should authorize');
    if (state.statusCode !== undefined) throw new Error('authorized request should not set status');
  }

  // A signature produced with the wrong secret is rejected.
  {
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(
      dbWithStoredSecret() as never,
      signedRequest('wrong-secret', { method: 'POST', url: '/actions/action-1/execute' }),
      reply
    );
    if (ok) throw new Error('wrong secret should not authorize request');
    if (state.statusCode !== 401) throw new Error(`wrong secret should return 401, got ${state.statusCode}`);
  }

  // A replayed nonce (same signed request twice) is rejected the second time.
  {
    const request = signedRequest('env-secret', { method: 'POST', url: '/actions/replay/execute', body: { actor: 'local-agent' } });
    const first = replyState();
    const okFirst = await verifyLocalAgentRequest(dbWithStoredSecret() as never, request, first.reply);
    if (!okFirst) throw new Error('first signed request should authorize');
    const second = replyState();
    const okSecond = await verifyLocalAgentRequest(dbWithStoredSecret() as never, request, second.reply);
    if (okSecond) throw new Error('replayed nonce should be rejected');
    if (second.state.statusCode !== 401) throw new Error(`replayed request should return 401, got ${second.state.statusCode}`);
  }

  // With no configured secret at all, protected routes return 503.
  env.LOCAL_AGENT_SHARED_SECRET = undefined;
  {
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(
      dbWithStoredSecret() as never,
      signedRequest('anything', { method: 'POST', url: '/actions/action-1/execute' }),
      reply
    );
    if (ok) throw new Error('missing configured secret should not authorize request');
    if (state.statusCode !== 503) throw new Error(`missing configured secret should return 503, got ${state.statusCode}`);
  }

  // A stored (encrypted) secret authorizes a request signed with that secret.
  {
    const { encryptJson } = await import('./encryption.js');
    const db = dbWithStoredSecret(encryptJson('stored-secret'));
    const { reply, state } = replyState();
    const ok = await verifyLocalAgentRequest(
      db as never,
      signedRequest('stored-secret', { method: 'POST', url: '/actions/stored/execute', body: { actor: 'local-agent' } }),
      reply
    );
    if (!ok) throw new Error('stored local agent secret should authorize signed request');
    if (state.statusCode !== undefined) throw new Error('authorized stored-secret request should not set status');
  }

  console.log('localAgentAuth unit test passed');
} finally {
  env.LOCAL_AGENT_SHARED_SECRET = originalSecret;
}
