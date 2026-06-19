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
 * database is unreachable. Decryption failures are allowed to surface because
 * they indicate an encryption-key mismatch that should not be silently ignored.
 */
export async function getCredentialValue(db: PrismaClient, key: string): Promise<string | undefined> {
  // A missing row legitimately returns undefined; a real DB read error or a decrypt
  // failure (key mismatch / corruption) is propagated so security-sensitive callers
  // fail closed instead of silently treating the secret as "not configured".
  let row: { encryptedValue: string } | null;
  try {
    row = await db.credential.findUnique({ where: { key }, select: { encryptedValue: true } });
  } catch (error) {
    console.error(`Failed to read credential ${key} from the database.`, error instanceof Error ? error.message : error);
    throw error;
  }
  if (!row) return undefined;
  const value = decryptJson<string>(row.encryptedValue);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Return the set of credential keys that currently have a stored value. */
export async function getStoredCredentialKeys(db: PrismaClient): Promise<Set<string>> {
  try {
    const rows = (await db.credential.findMany({ select: { key: true } })) as Array<{ key: string }>;
    return new Set(rows.map((row) => row.key));
  } catch (error) {
    console.error('Failed to list stored credential keys.', error instanceof Error ? error.message : error);
    return new Set();
  }
}
