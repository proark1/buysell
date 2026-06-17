import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const algorithm = 'aes-256-gcm';
const developmentFallbackKey = 'development-only-change-me';

const key = (): Buffer => createHash('sha256')
  .update(env.BUYSELL_ENCRYPTION_KEY ?? developmentFallbackKey)
  .digest();

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptJson<T>(value: string): T {
  const [ivText, authTagText, encryptedText] = value.split('.');
  if (!ivText || !authTagText || !encryptedText) {
    throw new Error('Encrypted value has an invalid format');
  }
  const decipher = createDecipheriv(algorithm, key(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagText, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
