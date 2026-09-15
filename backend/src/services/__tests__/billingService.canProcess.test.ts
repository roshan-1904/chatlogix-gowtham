import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  numericEnv: {
    textCreditsPerMessage: 1,
    audioCreditsPerMessage: 3,
    imageCreditsPerMessage: 2,
    documentCreditsPerMessage: 1,
    videoCreditsPerMessage: 10,
    locationCreditsPerMessage: 1,
    stickerCreditsPerMessage: 1,
    contactCreditsPerMessage: 1,
    interactiveCreditsPerMessage: 1,
    reactionCreditsPerMessage: 1
  }
}));

import { canProcessMessage, creditsForAssistantTurnWorstCase } from '../billingService.js';

describe('creditsForAssistantTurnWorstCase', () => {
  it('is 1 text + max(3 images, 1 video) using env credit weights', () => {
    // 1 + max(6, 10) = 11
    expect(creditsForAssistantTurnWorstCase()).toBe(11);
  });
});

describe('canProcessMessage assistantTurnWorstCaseMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorFindUnique.mockResolvedValue({
      id: 'vendor-1',
      walletBalance: creditsForAssistantTurnWorstCase(),
      trialExpiresAt: null,
      registrationStatus: 'approved'
    });
  });

  it('allows when balance meets worst-case assistant turn cost', async () => {
    const result = await canProcessMessage('vendor-1', 'text', { assistantTurnWorstCaseMedia: true });
    expect(result).toEqual({ allowed: true });
  });

  it('blocks when balance is below worst-case but still positive', async () => {
    const required = creditsForAssistantTurnWorstCase();
    vendorFindUnique.mockResolvedValue({
      id: 'vendor-1',
      walletBalance: required - 1,
      trialExpiresAt: null,
      registrationStatus: 'approved'
    });

    const result = await canProcessMessage('vendor-1', 'text', { assistantTurnWorstCaseMedia: true });
    expect(result).toEqual({ allowed: false, reason: 'insufficient_balance' });
  });

  it('default check only requires balance >= 1 credit', async () => {
    vendorFindUnique.mockResolvedValue({
      id: 'vendor-1',
      walletBalance: 1,
      trialExpiresAt: null,
      registrationStatus: 'approved'
    });

    const result = await canProcessMessage('vendor-1', 'text');
    expect(result).toEqual({ allowed: true });
  });
});
