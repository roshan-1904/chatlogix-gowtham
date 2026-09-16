import { prisma } from '../../db/prisma.js';
import { walletEnv } from '../../config/env.js';
import { ensurePlatformSettings, getPlatformSettings } from '../platformSettingsService.js';
import { paiseToMilli } from '../../utils/money.js';

const RECENT_TRANSACTION_LIMIT = 20;

export async function getVendorWalletSummary(vendorId: string) {
  await ensurePlatformSettings();
  const settings = getPlatformSettings();
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      walletBalanceMilli: true,
      registrationStatus: true
    }
  });

  if (!vendor) {
    return null;
  }

  const recentTransactions = await prisma.walletTransaction.findMany({
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
  });

  return {
    balanceMilli: vendor.walletBalanceMilli,
    registrationStatus: vendor.registrationStatus,
    provider: walletEnv.paymentProvider,
    mockTopUpEnabled: settings.mockWalletTopUpEnabled,
    presetsMilli: settings.walletTopUpPresetsPaise.map(paiseToMilli),
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
