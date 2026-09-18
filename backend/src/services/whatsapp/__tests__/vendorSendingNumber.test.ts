import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    whatsAppNumber: { findMany: vi.fn() }
  }
}));

vi.mock('../../../db/prisma.js', () => ({ prisma: prismaMock }));

import {
  pickVendorSendingNumber,
  resolveVendorSendingNumber,
  resolveVendorSendingPhoneNumberId,
  type VendorSendingNumberCandidate
} from '../vendorSendingNumber.js';

function row(
  phoneNumberId: string,
  connectStatus: string | null,
  createdAt: string,
  accessTokenEncrypted: string | null = connectStatus ? 'enc:token' : null
): VendorSendingNumberCandidate {
  return {
    phoneNumberId,
    connectStatus,
    accessTokenEncrypted,
    createdAt: new Date(createdAt)
  };
}

const LEGACY = row('legacy-pn', null, '2025-01-01T00:00:00.000Z', null);
const LIVE = row('live-pn', 'live', '2026-01-01T00:00:00.000Z');
const CREDIT_ATTACHED = row('credit-pn', 'credit_attached', '2026-02-01T00:00:00.000Z');
const NEWER_ERROR = row('error-pn', 'error', '2026-09-18T00:00:00.000Z');
const NEWER_DISCONNECTED = row('disconnected-pn', 'disconnected', '2026-09-18T00:00:00.000Z');
const IN_PROGRESS = row('in-progress-pn', 'meta_in_progress', '2026-09-17T00:00:00.000Z');

describe('pickVendorSendingNumber', () => {
  it('returns the single legacy row for a pre-P2h vendor (unchanged behavior)', () => {
    expect(pickVendorSendingNumber([LEGACY])).toBe(LEGACY);
  });

  it('prefers a live row over a newer error row', () => {
    expect(pickVendorSendingNumber([LIVE, NEWER_ERROR])).toBe(LIVE);
  });

  it('does not select a disconnected row while a live row exists', () => {
    expect(pickVendorSendingNumber([NEWER_DISCONNECTED, LIVE])).toBe(LIVE);
  });

  it('falls back to the only row a vendor has even when it is an error row', () => {
    // Last resort, and identical to the pre-P2h newest-wins result: returning
    // null here would drop the send onto the global-env phoneNumberId fallback,
    // which is unset in production.
    expect(pickVendorSendingNumber([NEWER_ERROR])).toBe(NEWER_ERROR);
  });

  it('prefers a legacy row over a newer broken P2h row', () => {
    expect(pickVendorSendingNumber([LEGACY, NEWER_ERROR, NEWER_DISCONNECTED])).toBe(LEGACY);
  });

  it('prefers a sendable P2h row over a legacy row', () => {
    expect(pickVendorSendingNumber([LEGACY, CREDIT_ATTACHED])).toBe(CREDIT_ATTACHED);
  });

  it('keeps newest-wins between two sendable rows', () => {
    expect(pickVendorSendingNumber([CREDIT_ATTACHED, LIVE])).toBe(CREDIT_ATTACHED);
    expect(
      pickVendorSendingNumber([CREDIT_ATTACHED, row('newest-pn', 'live', '2026-03-01T00:00:00.000Z')])
        ?.phoneNumberId
    ).toBe('newest-pn');
  });

  it('ranks a mid-connect row above broken rows but below a sendable one', () => {
    expect(pickVendorSendingNumber([NEWER_ERROR, IN_PROGRESS])).toBe(IN_PROGRESS);
    expect(pickVendorSendingNumber([IN_PROGRESS, LIVE])).toBe(LIVE);
  });

  it('returns null when the vendor has no numbers', () => {
    expect(pickVendorSendingNumber([])).toBeNull();
  });
});

describe('resolveVendorSendingNumber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries every row for the vendor and applies the ranking', async () => {
    prismaMock.whatsAppNumber.findMany.mockResolvedValue([NEWER_ERROR, LIVE]);

    const result = await resolveVendorSendingNumber('v1');

    expect(prismaMock.whatsAppNumber.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vendorId: 'v1' } })
    );
    expect(result?.phoneNumberId).toBe('live-pn');
  });

  it('resolveVendorSendingPhoneNumberId returns undefined when there are no rows', async () => {
    prismaMock.whatsAppNumber.findMany.mockResolvedValue([]);

    await expect(resolveVendorSendingPhoneNumberId('v1')).resolves.toBeUndefined();
  });
});
