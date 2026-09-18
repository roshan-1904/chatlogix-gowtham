import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function encryptionKeyBytes(): Buffer {
  const raw = env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY is not configured');
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // fall through to hash
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Encrypt a Meta business token for storage on WhatsAppNumber.accessTokenEncrypted.
 * Format: base64(iv || authTag || ciphertext).
 */
export function encryptWhatsAppToken(plaintext: string): string {
  const key = encryptionKeyBytes();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptWhatsAppToken(ciphertext: string): string {
  const key = encryptionKeyBytes();
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length < IV_LENGTH + 16 + 1) {
    throw new Error('Invalid encrypted WhatsApp token payload');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = buf.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
