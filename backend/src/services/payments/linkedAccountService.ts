import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import { encryptWhatsAppToken } from '../../utils/whatsappTokenCrypto.js';
import { getLinkedAccountClient } from './linkedAccountClient.js';

export interface LinkedAccountOptInInput {
  legalName: string;
  businessType: string;
  pan: string;
  gstin?: string;
  gstExempt?: boolean;
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountHolderName: string;
  contactEmail: string;
  contactPhone: string;
}

export function maskBankAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `****${digits.slice(-4)}`;
}

export function isCodPaymentMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  const m = method.toLowerCase();
  return m === 'cod' || m === 'cash' || m === 'vendor_collected' || m.includes('cod');
}

export function isCodPaymentPreference(pref: string | null | undefined): boolean {
  if (!pref) return false;
  const p = pref.toLowerCase();
  return p.includes('cod') || p.includes('cash on delivery') || p === 'cash';
}

export async function submitLinkedAccountOptIn(
  vendorId: string,
  input: LinkedAccountOptInInput
): Promise<{ linkedAccountId: string; status: string; bankAccountMasked: string }> {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) {
    throw Object.assign(new Error('Vendor not found'), { statusCode: 404 });
  }
  if (vendor.razorpayLinkedAccountId) {
    throw Object.assign(new Error('Linked account already submitted'), { statusCode: 409 });
  }
  if (!input.gstExempt && !input.gstin?.trim()) {
    throw Object.assign(new Error('GSTIN or gstExempt declaration is required'), { statusCode: 400 });
  }

  const client = getLinkedAccountClient();
  const created = await client.createLinkedAccount({
    email: input.contactEmail,
    phone: input.contactPhone,
    legalBusinessName: input.legalName,
    businessType: input.businessType,
    contactName: input.legalName,
    profile: { category: 'services', subcategory: 'saas' },
    legalInfo: {
      pan: input.pan.toUpperCase(),
      ...(input.gstExempt ? {} : { gst: input.gstin!.toUpperCase() })
    },
    bankAccount: {
      name: input.bankAccountHolderName,
      ifsc: input.bankIfsc.toUpperCase(),
      account_number: input.bankAccountNumber
    },
    notes: { vendorId, purpose: 'route_linked_account' }
  });

  const bankAccountMasked = maskBankAccount(input.bankAccountNumber);
  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      razorpayLinkedAccountId: created.id,
      linkedAccountStatus: created.status,
      legalName: input.legalName,
      panEncrypted: encryptWhatsAppToken(input.pan.toUpperCase()),
      gstin: input.gstExempt ? null : input.gstin?.toUpperCase() ?? null,
      gstExempt: !!input.gstExempt,
      businessType: input.businessType,
      settlementBankAccountMasked: bankAccountMasked,
      settlementBankIfsc: input.bankIfsc.toUpperCase(),
      settlementAccountHolderName: input.bankAccountHolderName,
      settlementContactEmail: input.contactEmail,
      settlementContactPhone: input.contactPhone
    }
  });

  logger.info({ vendorId, linkedAccountId: created.id }, 'Route linked account created (pending activation)');
  return { linkedAccountId: created.id, status: created.status, bankAccountMasked };
}

export async function handleLinkedAccountWebhookInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: { accountId: string; status: string; holderNameMismatch?: boolean }
): Promise<void> {
  const vendor = await tx.vendor.findFirst({
    where: { razorpayLinkedAccountId: input.accountId }
  });
  if (!vendor) {
    logger.warn({ accountId: input.accountId }, 'account webhook for unknown linked account');
    return;
  }

  if (input.holderNameMismatch && input.status === 'activated') {
    await tx.vendor.update({
      where: { id: vendor.id },
      data: { linkedAccountStatus: 'needs_review' }
    });
    return;
  }

  const updates: {
    linkedAccountStatus: string;
    paymentsManagedByChatlogix?: boolean;
    collectionStartedAt?: Date;
  } = { linkedAccountStatus: input.status };

  if (input.status === 'activated') {
    updates.paymentsManagedByChatlogix = true;
    updates.collectionStartedAt = new Date();
  }

  await tx.vendor.update({ where: { id: vendor.id }, data: updates });
}

/**
 * Clears a non-active Route opt-in so the shop can submit again (e.g. wrong mode, Route not enabled).
 * Does not touch Razorpay remotely — only ChatLogix DB state.
 */
export async function clearLinkedAccountOptIn(vendorId: string): Promise<{ cleared: true }> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      paymentsManagedByChatlogix: true,
      linkedAccountStatus: true,
      razorpayLinkedAccountId: true
    }
  });
  if (!vendor) {
    throw Object.assign(new Error('Vendor not found'), { statusCode: 404 });
  }
  if (vendor.paymentsManagedByChatlogix || vendor.linkedAccountStatus === 'activated') {
    throw Object.assign(
      new Error('Cannot clear an active payment collection profile'),
      { statusCode: 409 }
    );
  }
  if (!vendor.razorpayLinkedAccountId) {
    return { cleared: true };
  }

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      razorpayLinkedAccountId: null,
      linkedAccountStatus: null,
      collectionStartedAt: null,
      paymentsManagedByChatlogix: false,
      legalName: null,
      panEncrypted: null,
      gstin: null,
      gstExempt: false,
      businessType: null,
      settlementBankAccountMasked: null,
      settlementBankIfsc: null,
      settlementAccountHolderName: null,
      settlementContactEmail: null,
      settlementContactPhone: null
    }
  });

  logger.info(
    { vendorId, previousLinkedAccountId: vendor.razorpayLinkedAccountId },
    'Route linked account opt-in cleared (vendor may resubmit)'
  );
  return { cleared: true };
}

export async function getLinkedAccountStatus(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      paymentsManagedByChatlogix: true,
      paymentLinkAutoSend: true,
      linkedAccountStatus: true,
      razorpayLinkedAccountId: true,
      collectionStartedAt: true,
      legalName: true,
      gstin: true,
      gstExempt: true,
      settlementBankAccountMasked: true,
      settlementBankIfsc: true,
      settlementAccountHolderName: true,
      businessType: true,
      settlementContactEmail: true,
      settlementContactPhone: true
    }
  });
  if (!vendor) return null;
  return vendor;
}
