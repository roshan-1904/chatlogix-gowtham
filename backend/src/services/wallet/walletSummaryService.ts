import { prisma } from '../../db/prisma.js';
import { env, walletEnv } from '../../config/env.js';
import { ensurePlatformSettings, getPlatformSettings } from '../platformSettingsService.js';
import { paiseToMilli } from '../../utils/money.js';
import { AUTO_RECHARGE_PRESET_AMOUNTS_MILLI } from './autoRechargeConstants.js';

const RECENT_TRANSACTION_LIMIT = 20;

export async function getVendorWalletSummary(vendorId: string) {
  await ensurePlatformSettings();
  const settings = getPlatformSettings();
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      walletBalanceMilli: true,
      registrationStatus: true,
      autoRechargeEnabled: true,
      autoRechargeAmountMilli: true,
      autoRechargeMandateId: true
    }
  });

  if (!vendor) {
    return null;
  }

  const [recentTransactions, pendingRegistration, scheduledAttempt] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: {
        vendorId,
        transactionType: { in: ['recharge', 'deduction', 'refund'] }
      },
      orderBy: { transactionDate: 'desc' },
      take: RECENT_TRANSACTION_LIMIT,
      select: {
        id: true,
        transactionType: true,
        amountMilli: true,
        balanceAfterMilli: true,
        transactionDate: true,
        metadata: true
      }
    }),
    prisma.walletAutoRechargeRegistration.findFirst({
      where: { vendorId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amountMilli: true, createdAt: true }
    }),
    prisma.walletAutoRechargeAttempt.findFirst({
      where: { vendorId, status: { in: ['scheduled', 'pending'] } },
      orderBy: { scheduledDebitAt: 'asc' },
      select: { id: true, scheduledDebitAt: true, status: true, amountMilli: true }
    })
  ]);

  const razorpayKeyId =
    walletEnv.paymentProvider === 'razorpay' && env.RAZORPAY_KEY_ID?.trim()
      ? env.RAZORPAY_KEY_ID.trim()
      : undefined;

  return {
    balanceMilli: vendor.walletBalanceMilli,
    registrationStatus: vendor.registrationStatus,
    provider: walletEnv.paymentProvider,
    mockTopUpEnabled: settings.mockWalletTopUpEnabled,
    ...(razorpayKeyId ? { razorpayKeyId } : {}),
    presetsMilli: settings.walletTopUpPresetsPaise.map(paiseToMilli),
    autoRecharge: {
      enabled: vendor.autoRechargeEnabled,
      amountMilli: vendor.autoRechargeAmountMilli,
      hasMandate: Boolean(vendor.autoRechargeMandateId),
      presetAmountsMilli: [...AUTO_RECHARGE_PRESET_AMOUNTS_MILLI],
      pendingRegistration: pendingRegistration
        ? {
            registrationId: pendingRegistration.id,
            amountMilli: pendingRegistration.amountMilli,
            startedAt: pendingRegistration.createdAt.toISOString()
          }
        : null,
      scheduledDebit: scheduledAttempt
        ? {
            attemptId: scheduledAttempt.id,
            scheduledDebitAt: scheduledAttempt.scheduledDebitAt.toISOString(),
            status: scheduledAttempt.status,
            amountMilli: scheduledAttempt.amountMilli
          }
        : null
    },
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      transactionType: t.transactionType,
      amountMilli: t.amountMilli,
      balanceAfterMilli: t.balanceAfterMilli,
      transactionDate: t.transactionDate.toISOString(),
      metadata: (t.metadata as Record<string, unknown> | null) ?? undefined
    }))
  };
}
