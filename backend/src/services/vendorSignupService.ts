import { prisma } from '../db/prisma.js';
import { numericEnv } from '../config/env.js';
import { CustomError, ErrorType, ErrorSeverity } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export function normalizeVendorPhone(phoneNumber: string): string {
  const trimmed = phoneNumber.trim();
  if (!PHONE_REGEX.test(trimmed)) {
    throw new CustomError(
      'Phone number must be in E.164 format',
      400,
      ErrorType.VALIDATION,
      ErrorSeverity.LOW,
      true,
      { phoneNumber }
    );
  }
  return trimmed;
}

export interface CreateTrialVendorInput {
  phone: string;
  firebaseUid?: string;
}

export interface CreatedTrialVendor {
  vendorId: string;
  registrationStatus: string;
  walletBalance: number;
  trialGrantedPaise: number;
  trialExpiresAt: Date;
}

export async function findVendorByPhone(phoneNumber: string) {
  const phone = normalizeVendorPhone(phoneNumber);
  return prisma.vendor.findUnique({ where: { phone }, select: { id: true } });
}

export async function createTrialVendor(input: CreateTrialVendorInput | { phoneNumber: string; firebaseUid?: string }): Promise<CreatedTrialVendor & { id: string }> {
  const phone = normalizeVendorPhone('phone' in input ? input.phone : input.phoneNumber);
  const firebaseUid = input.firebaseUid;

  const existing = await prisma.vendor.findUnique({ where: { phone } });
  if (existing) {
    throw new CustomError(
      'This phone number already has an account',
      409,
      ErrorType.VALIDATION,
      ErrorSeverity.LOW,
      true,
      { code: 'phone_already_registered' }
    );
  }

  const grantPaise = numericEnv.trialGrantPaise;
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + numericEnv.trialExpiryDays);

  const vendor = await prisma.$transaction(async (tx) => {
    const created = await tx.vendor.create({
      data: {
        businessName: '',
        phone,
        email: '',
        subscriptionPlan: 'Trial',
        subscriptionStatus: 'trial',
        registrationStatus: 'onboarding',
        walletBalance: grantPaise,
        trialGrantedPaise: grantPaise,
        trialExpiresAt,
        registeredAt: new Date(),
        onboardingStep: 1,
        catalogImportEnabled: true,
        firebaseUid: firebaseUid ?? null
      }
    });

    await tx.walletTransaction.create({
      data: {
        vendorId: created.id,
        transactionType: 'recharge',
        amount: grantPaise,
        balanceBefore: 0,
        balanceAfter: grantPaise,
        metadata: { source: 'trial_grant' }
      }
    });

    return created;
  });

  logger.info(
    { vendorId: vendor.id, phone, grantPaise, trialExpiresAt },
    'trial_vendor_created'
  );

  return {
    id: vendor.id,
    vendorId: vendor.id,
    registrationStatus: vendor.registrationStatus,
    walletBalance: vendor.walletBalance,
    trialGrantedPaise: grantPaise,
    trialExpiresAt
  };
}

export async function getVendorRegistrationStatus(vendorId: string): Promise<string | undefined> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { registrationStatus: true }
  });
  return vendor?.registrationStatus ?? undefined;
}
