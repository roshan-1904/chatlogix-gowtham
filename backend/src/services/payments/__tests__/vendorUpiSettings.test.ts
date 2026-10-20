import { describe, it, expect } from 'vitest';
import { resolvePaymentSettingsPatch } from '../vendorUpiSettings.js';

const empty = { upiVpa: null, upiPayeeName: null };

describe('resolvePaymentSettingsPatch', () => {
  it('saves the ask-before-send switch without touching UPI fields', () => {
    const result = resolvePaymentSettingsPatch({ paymentLinkAutoSend: false }, empty);
    expect(result).toEqual({ ok: true, data: { paymentLinkAutoSend: false } });
  });

  it('saves a VPA when the payee name is already stored', () => {
    const result = resolvePaymentSettingsPatch(
      { upiVpa: 'shop@okaxis' },
      { upiVpa: null, upiPayeeName: 'Annapoorna' }
    );
    expect(result).toEqual({ ok: true, data: { upiVpa: 'shop@okaxis' } });
  });

  it('rejects a VPA when no payee name is available', () => {
    const result = resolvePaymentSettingsPatch({ upiVpa: 'shop@okaxis' }, empty);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('upiPayeeName');
  });

  it('rejects a VPA that is not local@handle', () => {
    const result = resolvePaymentSettingsPatch(
      { upiVpa: 'not-a-vpa', upiPayeeName: 'Shop' },
      empty
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('upiVpa');
  });

  it('clears a field when the client sends an empty string', () => {
    const result = resolvePaymentSettingsPatch(
      { upiVpa: '', upiPayeeName: '' },
      { upiVpa: 'shop@okaxis', upiPayeeName: 'Shop' }
    );
    expect(result).toEqual({ ok: true, data: { upiVpa: null, upiPayeeName: null } });
  });

  it('rejects clearing the payee name while a VPA remains', () => {
    const result = resolvePaymentSettingsPatch(
      { upiPayeeName: '' },
      { upiVpa: 'shop@okaxis', upiPayeeName: 'Shop' }
    );
    expect(result.ok).toBe(false);
  });
});
