/**
 * PATCH /api/vendors/:id/payments/settings
 * UPI ID, payee name, and ask-before-send are saved independently.
 */

const UPI_VPA = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;
const MAX_LEN = 100;

export interface PaymentSettingsBody {
  paymentLinkAutoSend?: unknown;
  upiVpa?: unknown;
  upiPayeeName?: unknown;
}

export interface StoredUpiSettings {
  upiVpa: string | null;
  upiPayeeName: string | null;
}

export interface PaymentSettingsUpdate {
  paymentLinkAutoSend?: boolean;
  upiVpa?: string | null;
  upiPayeeName?: string | null;
}

export type PaymentSettingsResolution =
  | { ok: true; data: PaymentSettingsUpdate }
  | { ok: false; field: string; message: string };

/** Empty string clears. undefined means the field was omitted. */
export function normalizeClearableString(value: unknown): string | null | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function resolvePaymentSettingsPatch(
  body: PaymentSettingsBody,
  stored: StoredUpiSettings
): PaymentSettingsResolution {
  const hasAuto = Object.prototype.hasOwnProperty.call(body, 'paymentLinkAutoSend');
  const hasVpa = Object.prototype.hasOwnProperty.call(body, 'upiVpa');
  const hasName = Object.prototype.hasOwnProperty.call(body, 'upiPayeeName');

  if (!hasAuto && !hasVpa && !hasName) {
    return { ok: false, field: 'body', message: 'No payment settings to update' };
  }

  if (hasAuto && typeof body.paymentLinkAutoSend !== 'boolean') {
    return {
      ok: false,
      field: 'paymentLinkAutoSend',
      message: 'paymentLinkAutoSend must be a boolean'
    };
  }

  const nextVpa = hasVpa ? normalizeClearableString(body.upiVpa) : stored.upiVpa;
  const nextName = hasName ? normalizeClearableString(body.upiPayeeName) : stored.upiPayeeName;

  if (nextVpa === 'invalid') {
    return { ok: false, field: 'upiVpa', message: 'upiVpa must be a string or null' };
  }
  if (nextName === 'invalid') {
    return { ok: false, field: 'upiPayeeName', message: 'upiPayeeName must be a string or null' };
  }

  if (nextVpa && (nextVpa.length > MAX_LEN || !UPI_VPA.test(nextVpa))) {
    return { ok: false, field: 'upiVpa', message: 'Invalid UPI ID (expected name@bank)' };
  }
  if (nextName && nextName.length > MAX_LEN) {
    return {
      ok: false,
      field: 'upiPayeeName',
      message: 'Payee name must be 100 characters or fewer'
    };
  }
  if (nextVpa && !nextName) {
    return {
      ok: false,
      field: 'upiPayeeName',
      message: 'Payee name is required when a UPI ID is set'
    };
  }

  const data: PaymentSettingsUpdate = {};
  if (hasAuto) data.paymentLinkAutoSend = body.paymentLinkAutoSend as boolean;
  if (hasVpa) data.upiVpa = nextVpa;
  if (hasName) data.upiPayeeName = nextName;
  return { ok: true, data };
}
