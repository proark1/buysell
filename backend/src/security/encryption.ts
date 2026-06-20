import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../config/env.js';

const algorithm = 'aes-256-gcm';
const developmentFallbackKey = 'development-only-change-me';
const aad = Buffer.from('buysell-credential-v2');

// Keys available for decryption: the active key plus an optional previous key (for rotation).
const keyMaterials = (): string[] => {
  const materials = [env.BUYSELL_ENCRYPTION_KEY, env.BUYSELL_ENCRYPTION_KEY_PREVIOUS]
    .filter((value): value is string => Boolean(value));
  if (materials.length === 0) materials.push(developmentFallbackKey);
  return materials;
};

const activeMaterial = (): string => keyMaterials()[0];

// Short stable id so a ciphertext records which key encrypted it (enables rotation).
const keyId = (material: string): string => createHash('sha256').update(`id:${material}`).digest('hex').slice(0, 16);

// Legacy (pre-v2) key derivation: a single unsalted SHA-256 of the key material.
const legacyKey = (material: string): Buffer => createHash('sha256').update(material).digest();

// scrypt-derived key, cached per (material, salt) so repeated decrypts of the same ciphertext
// on the auth hot path don't pay the scrypt cost every request.
const derivedKeyCache = new Map<string, Buffer>();
const deriveKey = (material: string, salt: Buffer): Buffer => {
  const cacheKey = `${keyId(material)}:${salt.toString('base64')}`;
  const cached = derivedKeyCache.get(cacheKey);
  if (cached) return cached;
  const key = scryptSync(material, salt, 32);
  if (derivedKeyCache.size > 2_000) derivedKeyCache.clear();
  derivedKeyCache.set(cacheKey, key);
  return key;
};

export function encryptJson(value: unknown): string {
  const material = activeMaterial();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(material, salt);
  const cipher = createCipheriv(algorithm, key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    'v2',
    keyId(material),
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join('.');
}

function decryptV2<T>(value: string): T {
  const [, id, saltText, ivText, authTagText, encryptedText] = value.split('.');
  if (!id || !saltText || !ivText || !authTagText || !encryptedText) {
    throw new Error('Encrypted value has an invalid v2 format');
  }
  const salt = Buffer.from(saltText, 'base64');
  const material = keyMaterials().find((candidate) => keyId(candidate) === id);
  if (!material) throw new Error('No encryption key matches this ciphertext (rotate via BUYSELL_ENCRYPTION_KEY_PREVIOUS)');
  const decipher = createDecipheriv(algorithm, deriveKey(material, salt), Buffer.from(ivText, 'base64'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(authTagText, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

function decryptLegacy<T>(value: string): T {
  const [ivText, authTagText, encryptedText] = value.split('.');
  if (!ivText || !authTagText || !encryptedText) {
    throw new Error('Encrypted value has an invalid format');
  }
  const iv = Buffer.from(ivText, 'base64');
  const ciphertext = Buffer.from(encryptedText, 'base64');
  const authTag = Buffer.from(authTagText, 'base64');
  // Try each known key (active, then previous) since legacy ciphertext has no key id.
  let lastError: unknown;
  for (const material of keyMaterials()) {
    try {
      const decipher = createDecipheriv(algorithm, legacyKey(material), iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8')) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to decrypt legacy value');
}

export function decryptJson<T>(value: string): T {
  return value.startsWith('v2.') ? decryptV2<T>(value) : decryptLegacy<T>(value);
}
