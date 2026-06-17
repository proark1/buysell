import { decryptJson, encryptJson } from './encryption.js';

const secret = 'super-secret-api-key-1234567890';

const encrypted = encryptJson(secret);
if (encrypted === secret) throw new Error('value was stored in plaintext');
if (!encrypted.includes('.')) throw new Error('unexpected ciphertext format');

const decrypted = decryptJson<string>(encrypted);
if (decrypted !== secret) throw new Error('round-trip did not return the original value');

// Each encryption uses a fresh IV, so identical inputs produce different ciphertext.
if (encryptJson(secret) === encrypted) throw new Error('ciphertext should not be deterministic');

// Tampered ciphertext must fail authentication rather than decrypt silently.
let tamperRejected = false;
try {
  decryptJson(encrypted.slice(0, -3) + 'AAA');
} catch {
  tamperRejected = true;
}
if (!tamperRejected) throw new Error('auth tag verification did not reject tampered ciphertext');

console.log('encryption unit test passed');
