import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { getCredentialValue } from '../repositories/credentialRepository.js';

export type CredentialSource = 'database' | 'environment' | 'unset';

const envValue = (key: string): string | undefined => {
  const value = (env as Record<string, string | undefined>)[key];
  return value === undefined || value === '' ? undefined : value;
};

/**
 * Resolve the effective value for a key, preferring a credential stored in the
 * database over the environment variable. Falls back to env when the database is
 * empty or unreachable.
 */
export async function getSecret(db: PrismaClient, key: string): Promise<string | undefined> {
  const stored = await getCredentialValue(db, key);
  if (stored !== undefined) return stored;
  return envValue(key);
}

/** Where the effective value for a key comes from, without revealing the value. */
export async function getSecretSource(db: PrismaClient, key: string): Promise<CredentialSource> {
  const stored = await getCredentialValue(db, key);
  if (stored !== undefined) return 'database';
  return envValue(key) !== undefined ? 'environment' : 'unset';
}
