import type { PrismaClient } from '@prisma/client';
import { decryptJson, encryptJson } from '../security/encryption.js';

/**
 * Store (or clear) an operator-managed secret. Values are encrypted with
 * AES-256-GCM before they touch the database. An empty value removes the row.
 */
export async function setCredentialValue(db: PrismaClient, key: string, value: string): Promise<void> {
  if (value === '') {
    await db.credential.deleteMany({ where: { key } });
    return;
  }

  const encryptedValue = encryptJson(value);
  await db.credential.upsert({
    where: { key },
    update: { encryptedValue },
    create: { key, encryptedValue }
  });
}

/**
 * Decrypt and return a stored credential, or undefined when it is not set or the
 * database is unreachable. Never throws so callers can safely fall back to env.
 */
export async function getCredentialValue(db: PrismaClient, key: string): Promise<string | undefined> {
  try {
    const row = await db.credential.findUnique({ where: { key } });
    if (!row) return undefined;
    const value = decryptJson<string>(row.encryptedValue);
    return typeof value === 'string' && value !== '' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Return the set of credential keys that currently have a stored value. */
export async function getStoredCredentialKeys(db: PrismaClient): Promise<Set<string>> {
  try {
    const rows = (await db.credential.findMany({ select: { key: true } })) as Array<{ key: string }>;
    return new Set(rows.map((row) => row.key));
  } catch {
    return new Set();
  }
}
