import { describe, expect, it } from 'vitest';
import { parseRazorpayErrorBody } from '../razorpayHttpErrors.js';

describe('parseRazorpayErrorBody', () => {
  it('parses standard Razorpay error envelope', () => {
    const parsed = parseRazorpayErrorBody(
      JSON.stringify({
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'Access Denied',
          source: 'gateway',
          step: 'NA',
          reason: 'NA',
          metadata: {}
        }
      })
    );
    expect(parsed?.code).toBe('BAD_REQUEST_ERROR');
    expect(parsed?.description).toBe('Access Denied');
    expect(parsed?.source).toBe('gateway');
  });

  it('returns null for non-json', () => {
    expect(parseRazorpayErrorBody('not json')).toBeNull();
  });
});
