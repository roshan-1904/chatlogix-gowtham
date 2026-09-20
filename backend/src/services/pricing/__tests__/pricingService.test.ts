import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();
const walletTransactionCreate = vi.fn();
const creditUsageCreate = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      update: (...args: unknown[]) => vendorUpdate(...args)
    },
    walletTransaction: {
      create: (...args: unknown[]) => walletTransactionCreate(...args)
    },
    creditUsage: {
      create: (...args: unknown[]) => creditUsageCreate(...args)
    }
  })
);

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args)
    },
    $transaction: (...args: [(tx: unknown) => Promise<unknown>]) => transaction(...args)
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// config/env.js validates the whole process environment at import time; stub
// the FX rate money.ts reads and the two platform-fee knobs this module reads.
vi.mock('../../../config/env.js', () => ({
  env: { USD_TO_INR_RATE: '83' },
  numericEnv: {
    platformFeePerTurnMilli: 0,
    platformFeeOutboundMediaMilli: 0
  }
}));

import {
  DEFAULT_MARKUP_PERCENT,
  InsufficientBalanceError,
  aiCostMilliFromUsd,
  chargeVendor,
  computeChargeMilli,
  computeTurnEstimate,
  getVendorMarkupPercent,
  normalizeMarkupPercent
} from '../pricingService.js';
import {
  clearPlatformSettingsCache,
  seedPlatformSettingsMemory
} from '../../platformSettingsService.js';

const VENDOR_ID = 'vendor-1';

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on externalId', {
    code: 'P2002',
    clientVersion: '5.17.0'
  });
}

/** The metadata JSON written to the WalletTransaction ledger row. */
function writtenMetadata(): Record<string, unknown> {
  return walletTransactionCreate.mock.calls[0][0].data.metadata as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  seedPlatformSettingsMemory({
    usdToInrRate: 83,
    usdToInrOverride: null,
    platformFeePerTurnPaise: 0,
    platformFeeOutboundMediaPaise: 0
  });
  vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 50_000, markupPercent: 50 });
  vendorUpdate.mockResolvedValue({});
  walletTransactionCreate.mockResolvedValue({ id: 'txn-1' });
  creditUsageCreate.mockResolvedValue({ id: 'usage-1' });
});

afterEach(() => {
  clearPlatformSettingsCache();
});

describe('computeChargeMilli', () => {
  it('charges ₹0.525 for an AI action costing ₹0.350 at the default markup', () => {
    const breakdown = computeChargeMilli({
      aiCostMilli: 350,
      markupPercent: DEFAULT_MARKUP_PERCENT
    });

    expect(breakdown.baseMilli).toBe(350);
    expect(breakdown.markupMilli).toBe(175);
    expect(breakdown.chargeMilli).toBe(525);
  });

  it('charges ₹0.390 for a reply costing ₹0.260 at the default markup', () => {
    const breakdown = computeChargeMilli({
      aiCostMilli: 260,
      markupPercent: DEFAULT_MARKUP_PERCENT
    });

    expect(breakdown.baseMilli).toBe(260);
    expect(breakdown.chargeMilli).toBe(390);
  });

  it('sums the AI, WhatsApp and platform-fee components before applying markup', () => {
    const breakdown = computeChargeMilli({
      aiCostMilli: 200,
      whatsappCostMilli: 50,
      platformFeeMilli: 10,
      markupPercent: 50
    });

    expect(breakdown.baseMilli).toBe(260);
    expect(breakdown.chargeMilli).toBe(390);
  });

  it('rounds once, after markup, so a sub-millirupee action still costs 1 milli', () => {
    // 0.4 milli of AI spend is ₹0.0004 — it would floor to 0 if each component
    // were rounded on the way in.
    expect(computeChargeMilli({ aiCostMilli: 0.4, markupPercent: 50 }).chargeMilli).toBe(1);
    expect(computeChargeMilli({ aiCostMilli: 0.001, markupPercent: 50 }).chargeMilli).toBe(1);
    // A single ceil, not one per component: three 0.4s are 1.8 -> 2, not 3.
    expect(
      computeChargeMilli({
        aiCostMilli: 0.4,
        whatsappCostMilli: 0.4,
        platformFeeMilli: 0.4,
        markupPercent: 50
      }).chargeMilli
    ).toBe(2);
  });

  it('keeps a genuinely zero cost at zero rather than ceiling it to 1', () => {
    expect(computeChargeMilli({ markupPercent: 50 }).chargeMilli).toBe(0);
    expect(computeChargeMilli({ aiCostMilli: 0, markupPercent: 50 }).chargeMilli).toBe(0);
  });

  it('ignores negative and non-finite cost components', () => {
    const breakdown = computeChargeMilli({
      aiCostMilli: -500,
      whatsappCostMilli: Number.NaN,
      platformFeeMilli: 100,
      markupPercent: 50
    });

    expect(breakdown.aiCostMilli).toBe(0);
    expect(breakdown.whatsappCostMilli).toBe(0);
    expect(breakdown.chargeMilli).toBe(150);
  });

  it('carries a real sub-paise OpenAI cost through to a 1 milli charge', () => {
    const aiCostMilli = aiCostMilliFromUsd(0.0000042); // ~0.349 milli
    expect(aiCostMilli).toBeLessThan(1);
    expect(computeChargeMilli({ aiCostMilli, markupPercent: 50 }).chargeMilli).toBe(1);
  });
});

describe('normalizeMarkupPercent', () => {
  it('falls back to the schema default for null/undefined/garbage', () => {
    expect(normalizeMarkupPercent(null)).toBe(DEFAULT_MARKUP_PERCENT);
    expect(normalizeMarkupPercent(undefined)).toBe(DEFAULT_MARKUP_PERCENT);
    expect(normalizeMarkupPercent(Number.NaN)).toBe(DEFAULT_MARKUP_PERCENT);
  });

  it('clamps to the admin-editable range', () => {
    expect(normalizeMarkupPercent(-10)).toBe(0);
    expect(normalizeMarkupPercent(0)).toBe(0);
    expect(normalizeMarkupPercent(900)).toBe(500);
  });
});

describe('getVendorMarkupPercent', () => {
  it('reads the vendor row', async () => {
    vendorFindUnique.mockResolvedValue({ markupPercent: 120 });
    await expect(getVendorMarkupPercent(VENDOR_ID)).resolves.toBe(120);
  });

  it('defaults when the vendor is missing', async () => {
    vendorFindUnique.mockResolvedValue(null);
    await expect(getVendorMarkupPercent(VENDOR_ID)).resolves.toBe(DEFAULT_MARKUP_PERCENT);
  });
});

describe('chargeVendor', () => {
  it('debits the wallet and writes both ledger rows in one transaction', async () => {
    const result = await chargeVendor({
      vendorId: VENDOR_ID,
      source: 'conversation_turn',
      cost: { aiCostMilli: 350 },
      conversationId: 'conv-1',
      idempotencyKey: 'wamid.1'
    });

    expect(result.outcome).toBe('charged');
    expect(result.breakdown.chargeMilli).toBe(525);
    expect(result.deductedMilli).toBe(525);
    expect(result.balanceAfterMilli).toBe(49_475);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(vendorUpdate).toHaveBeenCalledWith({
      where: { id: VENDOR_ID },
      data: { walletBalanceMilli: 49_475 }
    });
    expect(walletTransactionCreate.mock.calls[0][0].data).toMatchObject({
      vendorId: VENDOR_ID,
      transactionType: 'deduction',
      amountMilli: 525,
      balanceBeforeMilli: 50_000,
      balanceAfterMilli: 49_475
    });
    expect(creditUsageCreate.mock.calls[0][0].data).toEqual({
      vendorId: VENDOR_ID,
      source: 'conversation_turn',
      chargedMilli: 525,
      conversationId: 'conv-1',
      conversationType: 'text',
      externalId: 'wamid.1'
    });
  });

  it('resolves the markup from the vendor row inside the transaction and snapshots it', async () => {
    vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 50_000, markupPercent: 100 });

    const result = await chargeVendor({
      vendorId: VENDOR_ID,
      source: 'conversation_turn',
      cost: { aiCostMilli: 350 }
    });

    // 100% markup, read from the row rather than the DEFAULT_MARKUP_PERCENT.
    expect(result.breakdown.markupPercent).toBe(100);
    expect(result.deductedMilli).toBe(700);
    // The lookup happens on the transaction client, not on the base client.
    expect(vendorFindUnique.mock.calls[0][0]).toEqual({
      where: { id: VENDOR_ID },
      select: { walletBalanceMilli: true, markupPercent: true }
    });
    expect(writtenMetadata()).toMatchObject({
      source: 'conversation_turn',
      markupPercent: 100,
      aiCostMilli: 350,
      whatsappCostMilli: 0,
      platformFeeMilli: 0,
      baseMilli: 350,
      markupMilli: 350,
      chargeMilli: 700
    });
  });

  it('prefers an explicitly supplied markup over the vendor row', async () => {
    vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 50_000, markupPercent: 100 });

    const result = await chargeVendor({
      vendorId: VENDOR_ID,
      source: 'catalog_import',
      cost: { aiCostMilli: 350 },
      markupPercent: 50
    });

    expect(result.breakdown.markupPercent).toBe(50);
    expect(result.deductedMilli).toBe(525);
  });

  it('writes a CreditUsage row with null conversation columns for non-conversation sources', async () => {
    await chargeVendor({
      vendorId: VENDOR_ID,
      source: 'catalog_import',
      cost: { aiCostMilli: 1_000 },
      entityType: 'catalog_import_job',
      entityId: 'job-1',
      idempotencyKey: 'catalog_import:job-1'
    });

    expect(creditUsageCreate.mock.calls[0][0].data).toEqual({
      vendorId: VENDOR_ID,
      source: 'catalog_import',
      chargedMilli: 1_500,
      externalId: 'catalog_import:job-1'
    });
    expect(writtenMetadata()).toMatchObject({
      entityType: 'catalog_import_job',
      entityId: 'job-1',
      externalId: 'catalog_import:job-1'
    });
  });

  describe('floorAtZero', () => {
    it('never lets the balance go negative, and records the clamp', async () => {
      vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 100, markupPercent: 50 });

      const result = await chargeVendor({
        vendorId: VENDOR_ID,
        source: 'sandbox_chat',
        cost: { aiCostMilli: 350 },
        floorAtZero: true
      });

      expect(result.breakdown.chargeMilli).toBe(525);
      expect(result.deductedMilli).toBe(100);
      expect(result.balanceAfterMilli).toBe(0);
      expect(vendorUpdate).toHaveBeenCalledWith({
        where: { id: VENDOR_ID },
        data: { walletBalanceMilli: 0 }
      });
      // The ledger records what was actually taken, not the uncollectable charge.
      expect(walletTransactionCreate.mock.calls[0][0].data).toMatchObject({
        amountMilli: 100,
        balanceAfterMilli: 0
      });
      expect(creditUsageCreate.mock.calls[0][0].data.chargedMilli).toBe(100);
      expect(writtenMetadata()).toMatchObject({ clampedToBalance: true, chargeMilli: 525 });
    });

    it('clamps an already-empty wallet to a zero-value debit', async () => {
      vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 0, markupPercent: 50 });

      const result = await chargeVendor({
        vendorId: VENDOR_ID,
        source: 'sandbox_chat',
        cost: { aiCostMilli: 350 },
        floorAtZero: true
      });

      expect(result.deductedMilli).toBe(0);
      expect(result.balanceAfterMilli).toBe(0);
    });

    it('lets a live wallet go negative when the flag is off', async () => {
      vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 100, markupPercent: 50 });

      const result = await chargeVendor({
        vendorId: VENDOR_ID,
        source: 'conversation_turn',
        cost: { aiCostMilli: 350 }
      });

      expect(result.deductedMilli).toBe(525);
      expect(result.balanceAfterMilli).toBe(-425);
      expect(writtenMetadata()).not.toHaveProperty('clampedToBalance');
    });
  });

  it('is a no-op when the externalId was already charged', async () => {
    transaction.mockRejectedValueOnce(p2002Error());

    const result = await chargeVendor({
      vendorId: VENDOR_ID,
      source: 'conversation_turn',
      cost: { aiCostMilli: 350 },
      conversationId: 'conv-1',
      idempotencyKey: 'wamid.duplicate'
    });

    expect(result.outcome).toBe('already_charged');
    expect(result.deductedMilli).toBe(0);
    expect(result.balanceAfterMilli).toBeNull();
  });

  it('rethrows any other database failure', async () => {
    transaction.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      chargeVendor({
        vendorId: VENDOR_ID,
        source: 'conversation_turn',
        cost: { aiCostMilli: 350 }
      })
    ).rejects.toThrow('connection reset');
  });

  it('rejects a charge against a missing vendor', async () => {
    vendorFindUnique.mockResolvedValue(null);

    await expect(
      chargeVendor({
        vendorId: 'ghost',
        source: 'conversation_turn',
        cost: { aiCostMilli: 350 }
      })
    ).rejects.toThrow('Vendor not found: ghost');
  });

  describe('zero-cost short circuit', () => {
    it('skips without touching the database — the outbound-media path today', async () => {
      const result = await chargeVendor({
        vendorId: VENDOR_ID,
        source: 'outbound_media',
        cost: { platformFeeMilli: 0 },
        conversationId: 'conv-1',
        conversationType: 'image',
        idempotencyKey: 'outbound-msg:assistant-img-1'
      });

      expect(result.outcome).toBe('skipped');
      expect(result.deductedMilli).toBe(0);
      expect(result.balanceAfterMilli).toBeNull();
      expect(result.breakdown.chargeMilli).toBe(0);

      expect(transaction).not.toHaveBeenCalled();
      expect(vendorFindUnique).not.toHaveBeenCalled();
      expect(vendorUpdate).not.toHaveBeenCalled();
      expect(walletTransactionCreate).not.toHaveBeenCalled();
      expect(creditUsageCreate).not.toHaveBeenCalled();
    });

    it('also skips an entirely empty cost', async () => {
      const result = await chargeVendor({
        vendorId: VENDOR_ID,
        source: 'outbound_media',
        cost: {}
      });

      expect(result.outcome).toBe('skipped');
      expect(transaction).not.toHaveBeenCalled();
    });
  });
});

describe('computeTurnEstimate', () => {
  it('uses gpt-5.6-luna when aiModel is omitted', () => {
    const luna = computeTurnEstimate({ markupPercent: 50 });
    const mini = computeTurnEstimate({ markupPercent: 50, aiModel: 'gpt-4.1-mini' });
    // Luna list rates are lower, but worst-case completion budget is 2500+1200 vs 400+300.
    expect(luna.chargeMilli).toBeGreaterThan(mini.chargeMilli);
    expect(luna.chargeMilli).toBeGreaterThan(0);
  });

  it('reserves more when worst-case outbound media is included', () => {
    const base = computeTurnEstimate({ markupPercent: 50, aiModel: 'gpt-4.1-mini' });
    const withMedia = computeTurnEstimate({
      markupPercent: 50,
      aiModel: 'gpt-4.1-mini',
      includeWorstCaseMedia: true
    });

    expect(base.chargeMilli).toBeGreaterThan(0);
    // PLATFORM_FEE_OUTBOUND_MEDIA_MILLI is 0 until P2h, so the reservation is
    // identical today — the estimate must still be a positive AI-cost gate.
    expect(withMedia.chargeMilli).toBeGreaterThanOrEqual(base.chargeMilli);
  });

  it('scales with the vendor markup', () => {
    const at50 = computeTurnEstimate({ markupPercent: 50, aiModel: 'gpt-4.1-mini' }).chargeMilli;
    const at100 = computeTurnEstimate({ markupPercent: 100, aiModel: 'gpt-4.1-mini' }).chargeMilli;

    expect(at100).toBeGreaterThan(at50);
  });
});

describe('InsufficientBalanceError', () => {
  it('carries the code routes map to a 402', () => {
    const error = new InsufficientBalanceError();

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INSUFFICIENT_BALANCE');
    expect(error.name).toBe('InsufficientBalanceError');
    expect(error.message).toBe('insufficient_balance');
  });
});
