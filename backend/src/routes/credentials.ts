import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { CREDENTIAL_KEYS, getCredentialDef, isManagedCredential } from '../config/credentialKeys.js';
import { getCredentialValue, getStoredCredentialKeys, setCredentialValue } from '../repositories/credentialRepository.js';
import { verifyLocalAgentRequest } from '../security/localAgentAuth.js';
import type { CredentialType } from '../config/credentialKeys.js';

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

export async function registerCredentialRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/credentials', async (request, reply) => {
    if (!verifyLocalAgentRequest(request, reply)) return;
    const storedKeys = await getStoredCredentialKeys(prisma);
    const credentials = await Promise.all(CREDENTIAL_KEYS.map((def) => statusFor(def.key, storedKeys)));
    return { credentials };
  });

  app.put('/api/credentials/:key', async (request, reply) => {
    if (!verifyLocalAgentRequest(request, reply)) return;

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
    const storedKeys = await getStoredCredentialKeys(prisma);
    return { credential: await statusFor(params.data.key, storedKeys) };
  });
}
