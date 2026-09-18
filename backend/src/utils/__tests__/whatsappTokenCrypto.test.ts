import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    WHATSAPP_TOKEN_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  }
}));

import { encryptWhatsAppToken, decryptWhatsAppToken } from '../whatsappTokenCrypto.js';

describe('whatsappTokenCrypto', () => {
  it('round-trips a tenant token without exposing plaintext in ciphertext', () => {
    const token = 'EAAG-test-business-token-12345';
    const encrypted = encryptWhatsAppToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptWhatsAppToken(encrypted)).toBe(token);
  });
});
