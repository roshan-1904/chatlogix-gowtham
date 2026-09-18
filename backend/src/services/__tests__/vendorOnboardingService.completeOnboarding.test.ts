import { describe, it, expect, vi, beforeEach } from 'vitest';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      update: (...args: unknown[]) => vendorUpdate(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { completeOnboarding } from '../vendorOnboardingService.js';
import { logger } from '../../logger.js';

const VENDOR_ID = 'vendor-complete-1';

describe('completeOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets approved status without touching wallet fields', async () => {
    const approvedAt = new Date('2026-09-18T12:00:00.000Z');
    vendorFindUnique.mockResolvedValue({
      registrationStatus: 'onboarding',
      businessName: 'Test Shop',
      email: 'shop@example.com',
      submittedAt: null,
      approvedAt: null
    });
    vendorUpdate.mockResolvedValue({
      registrationStatus: 'approved',
      submittedAt: approvedAt,
      approvedAt
    });

    const result = await completeOnboarding(VENDOR_ID);

    expect(result.registrationStatus).toBe('approved');
    expect(result.submittedAt).toBe(approvedAt.toISOString());
    expect(result.approvedAt).toBe(approvedAt.toISOString());
    expect(vendorUpdate).toHaveBeenCalledOnce();
    const updateArg = vendorUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArg.where).toEqual({ id: VENDOR_ID });
    expect(updateArg.data).toMatchObject({
      registrationStatus: 'approved',
      approvedBy: 'system',
      subscriptionStatus: 'active',
      onboardingStep: 5
    });
    expect(updateArg.data).not.toHaveProperty('walletBalanceMilli');
    expect(updateArg.data).not.toHaveProperty('trialGrantedMilli');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ funnelEvent: 'approved', vendorId: VENDOR_ID, approvedBy: 'system' }),
      'onboarding_funnel'
    );
  });

  it('is idempotent when already approved and does not update or log funnel', async () => {
    const submittedAt = new Date('2026-09-01T10:00:00.000Z');
    const approvedAt = new Date('2026-09-02T11:00:00.000Z');
    vendorFindUnique.mockResolvedValue({
      registrationStatus: 'approved',
      businessName: 'Test Shop',
      email: 'shop@example.com',
      submittedAt,
      approvedAt
    });

    const result = await completeOnboarding(VENDOR_ID);

    expect(result).toEqual({
      registrationStatus: 'approved',
      submittedAt: submittedAt.toISOString(),
      approvedAt: approvedAt.toISOString()
    });
    expect(vendorUpdate).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('approves vendors in pending_approval', async () => {
    const now = new Date('2026-09-18T14:00:00.000Z');
    vi.setSystemTime(now);
    vendorFindUnique.mockResolvedValue({
      registrationStatus: 'pending_approval',
      businessName: 'Pending Shop',
      email: 'pending@example.com',
      submittedAt: new Date('2026-09-17T00:00:00.000Z'),
      approvedAt: null
    });
    vendorUpdate.mockResolvedValue({
      registrationStatus: 'approved',
      submittedAt: now,
      approvedAt: now
    });

    const result = await completeOnboarding(VENDOR_ID);

    expect(result.registrationStatus).toBe('approved');
    expect(vendorUpdate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('rejects incomplete profile', async () => {
    vendorFindUnique.mockResolvedValue({
      registrationStatus: 'onboarding',
      businessName: '',
      email: 'shop@example.com',
      submittedAt: null,
      approvedAt: null
    });

    await expect(completeOnboarding(VENDOR_ID)).rejects.toMatchObject({
      statusCode: 400,
      context: { code: 'incomplete_profile' }
    });
    expect(vendorUpdate).not.toHaveBeenCalled();
  });
});
