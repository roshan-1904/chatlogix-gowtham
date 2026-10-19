import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { logger } from '../../logger.js';
import { getLinkedAccountClient } from './linkedAccountClient.js';
import { maskBankAccount } from './linkedAccountService.js';
import {
  sendSettlementBankChangeOtp,
  verifySettlementBankChangeOtp
} from './settlementBankVerification.js';

const BANK_CHANGES_PER_DAY = 5;

export interface SettlementBankChangeInput {
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountHolderName: string;
  sessionInfo: string;
  otp: string;
}

async function countBankChangesToday(vendorId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.vendorSettlementControlAudit.count({
    where: { vendorId, field: 'settlementBank', createdAt: { gte: since } }
  });
}

async function notifyBankChange(vendor: {
  id: string;
  phone: string | null;
  email: string | null;
  settlementBankAccountMasked: string | null;
}): Promise<void> {
  const masked = vendor.settlementBankAccountMasked ?? 'your account';
  const message = `Your ChatLogix settlement bank account was changed to ${masked}. Releases pause for 48 hours. Contact support if this was not you.`;
  logger.info(
    { vendorId: vendor.id, phone: vendor.phone, email: vendor.email, channel: 'bank_change_notice' },
    message
  );
}

export async function requestSettlementBankChangeOtp(vendorId: string): Promise<{ sessionInfo: string }> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { phone: true, paymentsManagedByChatlogix: true, razorpayLinkedAccountId: true }
  });
  if (!vendor?.paymentsManagedByChatlogix || !vendor.razorpayLinkedAccountId) {
    throw createError('Payment collection is not active for this shop', 409, ErrorType.PAYMENT);
  }
  if (!vendor.phone) {
    throw createError('Registered phone is required for bank change verification', 400, ErrorType.VALIDATION);
  }
  if ((await countBankChangesToday(vendorId)) >= BANK_CHANGES_PER_DAY) {
    throw createError('Bank change limit reached for today', 429, ErrorType.VALIDATION);
  }
  return sendSettlementBankChangeOtp(vendorId, vendor.phone);
}

export async function confirmSettlementBankChange(
  vendorId: string,
  input: SettlementBankChangeInput
): Promise<{ bankAccountMasked: string; bankIfsc: string }> {
  if ((await countBankChangesToday(vendorId)) >= BANK_CHANGES_PER_DAY) {
    throw createError('Bank change limit reached for today', 429, ErrorType.VALIDATION);
  }
  await verifySettlementBankChangeOtp(input.sessionInfo, vendorId, input.otp);

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor?.razorpayLinkedAccountId) {
    throw createError('Linked account not found', 404, ErrorType.NOT_FOUND);
  }

  const client = getLinkedAccountClient();
  await client.updateLinkedAccountBank({
    accountId: vendor.razorpayLinkedAccountId,
    bankAccount: {
      name: input.bankAccountHolderName,
      ifsc: input.bankIfsc.toUpperCase(),
      account_number: input.bankAccountNumber
    }
  });

  const bankAccountMasked = maskBankAccount(input.bankAccountNumber);
  const now = new Date();
  const updated = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      settlementBankAccountMasked: bankAccountMasked,
      settlementBankIfsc: input.bankIfsc.toUpperCase(),
      settlementAccountHolderName: input.bankAccountHolderName,
      settlementBankChangedAt: now
    },
    select: {
      id: true,
      phone: true,
      email: true,
      settlementBankAccountMasked: true,
      settlementBankIfsc: true
    }
  });

  await prisma.vendorSettlementControlAudit.create({
    data: {
      id: randomUUID(),
      vendorId,
      changedBy: vendorId,
      field: 'settlementBank',
      oldValue: vendor.settlementBankAccountMasked,
      newValue: bankAccountMasked,
      reason: `ifsc:${input.bankIfsc.toUpperCase()}`
    }
  });

  await notifyBankChange(updated);
  return { bankAccountMasked, bankIfsc: updated.settlementBankIfsc! };
}
