import { prisma } from '../db/prisma.js';
import { CustomError, ErrorType, ErrorSeverity } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { ensurePlatformSettings, getPlatformSettings } from './platformSettingsService.js';
import { paiseToMilli } from '../utils/money.js';

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
  walletBalanceMilli: number;
  trialGrantedMilli: number;
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

  await ensurePlatformSettings();
  const settings = getPlatformSettings();
  const grantMilli = paiseToMilli(settings.trialGrantPaise);
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + settings.trialExpiryDays);

  const vendor = await prisma.$transaction(async (tx) => {
    const created = await tx.vendor.create({
      data: {
        businessName: '',
        phone,
        email: '',
        subscriptionPlan: 'Trial',
        subscriptionStatus: 'trial',
        registrationStatus: 'onboarding',
        walletBalanceMilli: grantMilli,
        trialGrantedMilli: grantMilli,
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
        amountMilli: grantMilli,
        balanceBeforeMilli: 0,
        balanceAfterMilli: grantMilli,
        metadata: { source: 'trial_grant' }
      }
    });

    return created;
  });

  logger.info(
    { vendorId: vendor.id, phone, grantMilli, trialExpiresAt },
    'trial_vendor_created'
  );

  return {
    id: vendor.id,
    vendorId: vendor.id,
    registrationStatus: vendor.registrationStatus,
    walletBalanceMilli: vendor.walletBalanceMilli,
    trialGrantedMilli: grantMilli,
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
