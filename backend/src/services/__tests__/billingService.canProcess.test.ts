import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const vendorFindUnique = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../config/env.js', () => ({
  env: { USD_TO_INR_RATE: '83' },
  numericEnv: {
    trialGrantMilli: 50000,
    trialExpiryDays: 30,
    platformFeePerTurnMilli: 0,
    platformFeeOutboundMediaMilli: 0
  }
}));

import { canProcessMessage } from '../billingService.js';
import { computeTurnEstimate } from '../pricing/pricingService.js';
import {
  clearPlatformSettingsCache,
  seedPlatformSettingsMemory
} from '../platformSettingsService.js';

const MODEL = 'gpt-4.1-mini';
const worstCaseTurnMilli = computeTurnEstimate({
  markupPercent: 50,
  aiModel: MODEL,
  includeWorstCaseMedia: true
}).chargeMilli;

function vendorRow(walletBalanceMilli: number) {
  return {
    id: 'vendor-1',
    walletBalanceMilli,
    markupPercent: 50,
    aiModel: MODEL,
    trialExpiresAt: null,
    registrationStatus: 'approved'
  };
}

describe('canProcessMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedPlatformSettingsMemory({
      usdToInrRate: 83,
      usdToInrOverride: null,
      platformFeePerTurnPaise: 0,
      platformFeeOutboundMediaPaise: 0
    });
    vendorFindUnique.mockResolvedValue(vendorRow(worstCaseTurnMilli));
  });

  afterEach(() => {
    clearPlatformSettingsCache();
  });

  it('allows when the balance covers a worst-case assistant turn at the vendor markup', async () => {
    const result = await canProcessMessage('vendor-1', 'text', { assistantTurnWorstCaseMedia: true });
    expect(result).toEqual({ allowed: true });
  });

  it('blocks a positive balance that cannot cover the estimated turn', async () => {
    vendorFindUnique.mockResolvedValue(vendorRow(worstCaseTurnMilli - 1));

    const result = await canProcessMessage('vendor-1', 'text', { assistantTurnWorstCaseMedia: true });
    expect(result).toEqual({ allowed: false, reason: 'insufficient_balance' });
  });

  it('blocks a near-empty wallet even without the worst-case media reservation', async () => {
    vendorFindUnique.mockResolvedValue(vendorRow(1));

    const result = await canProcessMessage('vendor-1', 'text');
    expect(result).toEqual({ allowed: false, reason: 'insufficient_balance' });
  });

  it('blocks an expired trial before looking at the balance', async () => {
    vendorFindUnique.mockResolvedValue({
      ...vendorRow(1_000_000),
      trialExpiresAt: new Date(Date.now() - 1000),
      registrationStatus: 'pending'
    });

    const result = await canProcessMessage('vendor-1', 'text');
    expect(result).toEqual({ allowed: false, reason: 'trial_expired' });
  });
});
