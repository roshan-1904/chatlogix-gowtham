import { describe, it, expect } from 'vitest';
import {
  createUpiPayLinkToken,
  verifyUpiPayLinkToken,
  buildTapToPayPageUrl
} from '../upiPayLinkToken.js';

describe('upiPayLinkToken', () => {
  it('round-trips order id in a signed token', () => {
    const token = createUpiPayLinkToken('ord-abc');
    const payload = verifyUpiPayLinkToken(token);
    expect(payload.orderId).toBe('ord-abc');
    expect(payload.typ).toBe('upi_pay');
  });

  it('builds a page URL containing the token', () => {
    const url = buildTapToPayPageUrl('tok.test');
    expect(url).toContain('/pay/u/');
    expect(url).toContain('tok.test');
  });
});
