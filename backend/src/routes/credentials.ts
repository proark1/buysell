import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { CREDENTIAL_KEYS, getCredentialDef, isManagedCredential } from '../config/credentialKeys.js';
import { getCredentialValue, getStoredCredentialKeys, setCredentialValue } from '../repositories/credentialRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import type { CredentialType } from '../config/credentialKeys.js';
import { getSecret } from '../services/secrets.js';
import { getKeepaTokenStatus } from '../clients/keepaClient.js';
import { getEbayAccessToken } from '../clients/ebaySellClient.js';
import { getAmazonSpApiAccessToken } from '../clients/amazonSpApiClient.js';

const updateSchema = z.object({ value: z.string() });
const paramsSchema = z.object({ key: z.string().min(1) });

const envValue = (key: string): string | undefined => {
  const value = (env as Record<string, string | undefined>)[key];
  return value === undefined || value === '' ? undefined : value;
};

const maskSecret = (value: string): string => {
  if (value.length <= 4) return '••••';
  return '••••••' + value.slice(-4);
};

/**
 * Build a safe status view for a credential. Secret values are never returned in
 * full; only a masked preview (last 4 chars) plus the source and whether it is set.
 */
async function statusFor(key: string, storedKeys: Set<string>): Promise<unknown> {
  const def = getCredentialDef(key);
  const type: CredentialType = def?.type ?? 'secret';
  const inDb = storedKeys.has(key);
  const value = inDb ? await getCredentialValue(prisma, key) : envValue(key);
  const source = inDb ? 'database' : value !== undefined ? 'environment' : 'unset';

  let preview: string | null = null;
  if (value !== undefined) {
    preview = type === 'secret' ? maskSecret(value) : value;
  }

  return {
    key,
    label: def?.label ?? key,
    group: def?.group ?? 'Other',
    type,
    help: def?.help,
    configured: value !== undefined,
    source,
    preview
  };
}

async function checkCredential(key: string): Promise<unknown> {
  if (key === 'KEEPA_API_KEY') {
    const apiKey = await getSecret(prisma, key);
    if (!apiKey) return { ok: false, status: 'missing', message: 'Keepa API key is not configured.' };
    const tokenStatus = await getKeepaTokenStatus(apiKey);
    return { ok: true, status: 'live', message: 'Keepa token endpoint responded.', tokenStatus };
  }

  if (key.startsWith('EBAY_')) {
    const clientId = await getSecret(prisma, 'EBAY_CLIENT_ID');
    const clientSecret = await getSecret(prisma, 'EBAY_CLIENT_SECRET');
    const refreshToken = await getSecret(prisma, 'EBAY_REFRESH_TOKEN');
    const sandbox = (await getSecret(prisma, 'EBAY_SANDBOX')) === 'true';
    if (!clientId || !clientSecret || !refreshToken) {
      return { ok: false, status: 'missing', message: 'eBay client ID, client secret, and refresh token are required for a live OAuth check.' };
    }
    await getEbayAccessToken({ clientId, clientSecret, refreshToken, sandbox });
    return { ok: true, status: 'live', message: 'eBay OAuth token exchange succeeded.' };
  }

  if (key.startsWith('AMAZON_SP_API_')) {
    const clientId = await getSecret(prisma, 'AMAZON_SP_API_CLIENT_ID');
    const clientSecret = await getSecret(prisma, 'AMAZON_SP_API_CLIENT_SECRET');
    const refreshToken = await getSecret(prisma, 'AMAZON_SP_API_REFRESH_TOKEN');
    if (!clientId || !clientSecret || !refreshToken) {
      return { ok: false, status: 'missing', message: 'Amazon SP-API client ID, client secret, and refresh token are required for a live LWA check.' };
    }
    await getAmazonSpApiAccessToken({ clientId, clientSecret, refreshToken });
    return { ok: true, status: 'live', message: 'Amazon LWA token exchange succeeded.' };
  }

  const value = await getSecret(prisma, key);
  return value
    ? { ok: true, status: 'configured', message: `${key} is configured. Live checks are not run for this credential to avoid spending provider quota.` }
    : { ok: false, status: 'missing', message: `${key} is not configured.` };
}

export async function registerCredentialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/credentials', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;
    const storedKeys = await getStoredCredentialKeys(prisma);
    const credentials = await Promise.all(CREDENTIAL_KEYS.map((def) => statusFor(def.key, storedKeys)));
    return { credentials };
  });

  app.put('/api/credentials/:key', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = paramsSchema.safeParse(request.params);
    const body = updateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'Invalid credential update', details: { params: params.error?.flatten(), body: body.error?.flatten() } });
    }
    if (!isManagedCredential(params.data.key)) {
      return reply.status(404).send({ error: 'Unknown credential key' });
    }

    const def = getCredentialDef(params.data.key);
    let value = body.data.value.trim();
    if (def?.type === 'toggle' && value !== '') {
      value = value === 'true' || value === '1' || value === 'on' ? 'true' : 'false';
    }

    await setCredentialValue(prisma, params.data.key, value);

    // Rotating the auth secret is security-sensitive: record it (without the value) and
    // note that the environment secret, if set, also remains valid.
    if (params.data.key === 'LOCAL_AGENT_SHARED_SECRET') {
      await prisma.auditLog.create({
        data: {
          entityType: 'Credential',
          entityId: params.data.key,
          action: value === '' ? 'SHARED_SECRET_CLEARED' : 'SHARED_SECRET_ROTATED',
          actor: 'dashboard',
          afterJson: { key: params.data.key, envSecretStillValid: Boolean(env.LOCAL_AGENT_SHARED_SECRET) }
        }
      });
    }

    const storedKeys = await getStoredCredentialKeys(prisma);
    return { credential: await statusFor(params.data.key, storedKeys) };
  });

  app.post('/api/credentials/:key/test', async (request, reply) => {
    if (!(await verifyLocalAgentRequest(prisma, request, reply))) return;

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'Invalid credential key', details: params.error.flatten() });
    }
    if (!isManagedCredential(params.data.key)) {
      return reply.status(404).send({ error: 'Unknown credential key' });
    }

    try {
      return { check: await checkCredential(params.data.key) };
    } catch (error) {
      return reply.status(502).send({
        error: 'Credential check failed',
        details: error instanceof Error ? error.message.slice(0, 500) : 'Unexpected credential check failure'
      });
    }
  });
}
