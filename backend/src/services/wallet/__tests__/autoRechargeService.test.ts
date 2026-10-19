import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AUTO_RECHARGE_THRESHOLD_MILLI } from '../../payments/settlementMath.js';
import {
  FakeRazorpayApiClient,
  setRazorpayApiClientForTests
} from '../../payments/razorpayApiClient.js';

const vendorFindUnique = vi.fn();
const attemptFindFirst = vi.fn();
const attemptCreate = vi.fn();
const attemptUpdate = vi.fn();
const vendorUpdate = vi.fn();
const vendorFindFirst = vi.fn();
const mandateAuditCreate = vi.fn();
const registrationFindUnique = vi.fn();
const registrationUpdate = vi.fn();
const registrationUpdateMany = vi.fn();
const attemptUpdateMany = vi.fn();
const lockExecuteRaw = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      findFirst: (...args: unknown[]) => vendorFindFirst(...args),
      update: (...args: unknown[]) => vendorUpdate(...args)
    },
    walletAutoRechargeAttempt: {
      findFirst: (...args: unknown[]) => attemptFindFirst(...args),
      create: (...args: unknown[]) => attemptCreate(...args),
      update: (...args: unknown[]) => attemptUpdate(...args),
      updateMany: (...args: unknown[]) => attemptUpdateMany(...args)
    },
    walletAutoRechargeRegistration: {
      findUnique: (...args: unknown[]) => registrationFindUnique(...args),
      update: (...args: unknown[]) => registrationUpdate(...args),
      updateMany: (...args: unknown[]) => registrationUpdateMany(...args)
    },
    walletAutoRechargeMandateAudit: {
      create: (...args: unknown[]) => mandateAuditCreate(...args)
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRaw: lockExecuteRaw,
        vendor: {
          findUnique: (...args: unknown[]) => vendorFindUnique(...args),
          findFirst: (...args: unknown[]) => vendorFindFirst(...args),
          update: (...args: unknown[]) => vendorUpdate(...args)
        },
        walletAutoRechargeAttempt: {
          updateMany: (...args: unknown[]) => attemptUpdateMany(...args)
        },
        walletAutoRechargeRegistration: {
          findUnique: (...args: unknown[]) => registrationFindUnique(...args),
          update: (...args: unknown[]) => registrationUpdate(...args),
          updateMany: (...args: unknown[]) => registrationUpdateMany(...args)
        },
        walletAutoRechargeMandateAudit: {
          create: (...args: unknown[]) => mandateAuditCreate(...args)
        }
      })
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const creditInTx = vi.fn();
vi.mock('../walletTopUpService.js', () => ({
  creditWalletFromTopUpInTx: (...args: unknown[]) => creditInTx(...args)
}));

const {
  scheduleAutoRechargeAttemptIfEligible,
  handleAutoRechargePaymentCapturedInTx,
  handleTokenPausedOrCancelledInTx
} = await import('../autoRechargeService.js');

describe('scheduleAutoRechargeAttemptIfEligible', () => {
  const fakeApi = new FakeRazorpayApiClient();
  const now = new Date('2026-10-19T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    fakeApi.preDebitNotifications.length = 0;
    setRazorpayApiClientForTests(fakeApi);
    vendorFindUnique.mockResolvedValue({
      walletBalanceMilli: 99_000,
      autoRechargeEnabled: true,
      autoRechargeAmountMilli: 500_000,
      autoRechargeMandateId: 'token_fake',
      razorpayWalletCustomerId: 'cust_1',
      email: 'v@test.in',
      phone: '9000000000'
    });
    attemptFindFirst.mockResolvedValue(null);
    attemptCreate.mockResolvedValue({ id: 'attempt-1' });
    attemptUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    setRazorpayApiClientForTests(null);
  });

  it('schedules one attempt when balance is under threshold with a mandate', async () => {
    const scheduled = await scheduleAutoRechargeAttemptIfEligible('v1', now);
    expect(scheduled).toBe(true);
    expect(attemptCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: 'v1',
          amountMilli: 500_000,
          status: 'scheduled'
        })
      })
    );
    expect(fakeApi.preDebitNotifications).toHaveLength(1);
  });

  it('does not schedule a second attempt the same day', async () => {
    attemptFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' });
    await scheduleAutoRechargeAttemptIfEligible('v1', now);
    const second = await scheduleAutoRechargeAttemptIfEligible('v1', now);
    expect(second).toBe(false);
    expect(attemptCreate).toHaveBeenCalledTimes(1);
  });

  it('skips when balance is at or above threshold', async () => {
    vendorFindUnique.mockResolvedValue({
      walletBalanceMilli: AUTO_RECHARGE_THRESHOLD_MILLI,
      autoRechargeEnabled: true,
      autoRechargeAmountMilli: 500_000,
      autoRechargeMandateId: 'token_fake',
      razorpayWalletCustomerId: 'cust_1',
      email: 'v@test.in',
      phone: '9000000000'
    });
    const scheduled = await scheduleAutoRechargeAttemptIfEligible('v1', now);
    expect(scheduled).toBe(false);
    expect(attemptCreate).not.toHaveBeenCalled();
  });
});

describe('handleAutoRechargePaymentCapturedInTx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockExecuteRaw.mockResolvedValue(undefined);
    vendorFindUnique.mockResolvedValue({
      autoRechargeAmountMilli: 1_000_000,
      settlementBalanceMilli: BigInt(5_000_000)
    });
    creditInTx.mockResolvedValue({
      balanceBeforeMilli: 50_000,
      balanceAfterMilli: 1_050_000,
      transactionId: 'txn-1',
      idempotent: false
    });
    attemptUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('credits exactly the preset and does not touch settlement balance', async () => {
    const tx = {
      $executeRaw: lockExecuteRaw,
      vendor: { findUnique: vendorFindUnique, update: vendorUpdate },
      walletAutoRechargeAttempt: { updateMany: attemptUpdateMany }
    };

    await handleAutoRechargePaymentCapturedInTx(tx as never, {
      id: 'pay_ar_1',
      amount: 100_000,
      notes: {
        purpose: 'wallet_autorecharge',
        vendorId: 'v1',
        attemptId: 'attempt-1',
        amountMilli: '1000000'
      }
    });

    expect(creditInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        vendorId: 'v1',
        amountMilli: 1_000_000,
        idempotencyKey: 'pay_ar_1'
      })
    );
    expect(vendorUpdate).not.toHaveBeenCalled();
  });
});

describe('handleTokenPausedOrCancelledInTx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockExecuteRaw.mockResolvedValue(undefined);
    vendorFindFirst.mockResolvedValue({ id: 'v1' });
    vendorUpdate.mockResolvedValue({});
    attemptUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('token.cancelled turns auto-recharge off and cancels scheduled attempts', async () => {
    const tx = {
      $executeRaw: lockExecuteRaw,
      vendor: {
        findFirst: vendorFindFirst,
        update: vendorUpdate
      },
      walletAutoRechargeAttempt: { updateMany: attemptUpdateMany }
    };

    await handleTokenPausedOrCancelledInTx(
      tx as never,
      { id: 'token_fake', notes: { vendorId: 'v1' } },
      'token.cancelled'
    );

    expect(vendorUpdate).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { autoRechargeEnabled: false, autoRechargeMandateId: null }
    });
    expect(attemptUpdateMany).toHaveBeenCalledWith({
      where: { vendorId: 'v1', status: { in: ['scheduled', 'pending'] } },
      data: { status: 'cancelled', failureReason: 'token.cancelled' }
    });
  });
});
