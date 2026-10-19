import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import type { Prisma } from '@prisma/client';
import { lockVendorForSettlement } from '../payments/vendorSettlementLock.js';

export type WalletTopUpCreditMetadata = {
  source: 'wallet_topup' | 'wallet_autorecharge' | 'admin_recharge';
  provider?: string;
  intentId?: string;
  idempotencyKey: string;
  amountMilli: number;
  currency: 'INR';
  [key: string]: unknown;
};

export async function assertVendorCanTopUp(vendorId: string): Promise<void> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, registrationStatus: true }
  });

  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  if (vendor.registrationStatus !== 'approved') {
    throw createError(
      'Wallet top-up is only available for approved vendors',
      403,
      ErrorType.AUTHORIZATION,
      undefined,
      { error: 'vendor_not_approved', registrationStatus: vendor.registrationStatus }
    );
  }
}

async function findRechargeByIdempotencyKey(
  tx: Prisma.TransactionClient,
  vendorId: string,
  idempotencyKey: string
) {
  return tx.walletTransaction.findFirst({
    where: {
      vendorId,
      transactionType: 'recharge',
      metadata: {
        path: ['idempotencyKey'],
        equals: idempotencyKey
      }
    }
  });
}

export type CreditWalletFromTopUpResult = {
  balanceBeforeMilli: number;
  balanceAfterMilli: number;
  transactionId: string;
  idempotent: boolean;
};

export async function creditWalletFromTopUpInTx(
  tx: Prisma.TransactionClient,
  input: {
    vendorId: string;
    amountMilli: number;
    idempotencyKey: string;
    metadata: WalletTopUpCreditMetadata;
  }
): Promise<CreditWalletFromTopUpResult> {
  const { vendorId, amountMilli, idempotencyKey, metadata } = input;

  if (!Number.isInteger(amountMilli) || amountMilli <= 0) {
    throw createError('Invalid top-up amount', 400, ErrorType.VALIDATION, undefined, { error: 'invalid_amount' });
  }

  const existing = await findRechargeByIdempotencyKey(tx, vendorId, idempotencyKey);
  if (existing) {
    return {
      balanceBeforeMilli: existing.balanceBeforeMilli,
      balanceAfterMilli: existing.balanceAfterMilli,
      transactionId: existing.id,
      idempotent: true
    };
  }

  await lockVendorForSettlement(tx, vendorId);

  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: { walletBalanceMilli: true }
  });

  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const balanceBeforeMilli = vendor.walletBalanceMilli;
  const balanceAfterMilli = balanceBeforeMilli + amountMilli;

  await tx.vendor.update({
    where: { id: vendorId },
    data: { walletBalanceMilli: balanceAfterMilli }
  });

  const row = await tx.walletTransaction.create({
    data: {
      vendorId,
      transactionType: 'recharge',
      amountMilli,
      balanceBeforeMilli,
      balanceAfterMilli,
      metadata: metadata as Prisma.InputJsonValue
    }
  });

  return {
    balanceBeforeMilli,
    balanceAfterMilli,
    transactionId: row.id,
    idempotent: false
  };
}

export async function creditWalletFromTopUp(input: {
  vendorId: string;
  amountMilli: number;
  idempotencyKey: string;
  metadata: WalletTopUpCreditMetadata;
}): Promise<CreditWalletFromTopUpResult> {
  return prisma.$transaction((tx) => creditWalletFromTopUpInTx(tx, input));
}

/** Unique idempotency key for one-off admin recharges (each request credits once). */
export function newAdminRechargeIdempotencyKey(): string {
  return `admin_recharge:${randomUUID()}`;
}
