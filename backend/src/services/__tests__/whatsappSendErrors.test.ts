import { describe, it, expect } from 'vitest';
import { isInvalidQuoteContextError } from '../whatsappSendErrors.js';

describe('isInvalidQuoteContextError', () => {
  it('matches the live 2026-09-21 Graph body (#100 Invalid parameter, no subcode)', () => {
    expect(isInvalidQuoteContextError(400, 100, undefined, '(#100) Invalid parameter')).toBe(true);
  });

  it('matches the documented Cloud API subcode 2593006', () => {
    expect(isInvalidQuoteContextError(400, 100, 2593006, 'whatever')).toBe(true);
  });

  it('does not treat auth or rate-limit failures as quote errors', () => {
    expect(isInvalidQuoteContextError(401, 190, undefined, 'invalid token')).toBe(false);
    expect(isInvalidQuoteContextError(429, 4, undefined, 'rate limit')).toBe(false);
  });
});
