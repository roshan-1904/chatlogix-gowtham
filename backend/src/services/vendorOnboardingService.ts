import { prisma } from '../db/prisma.js';
import { CustomError, ErrorType, ErrorSeverity } from '../middleware/errorHandler.js';
import { logOnboardingFunnelEvent } from './onboardingFunnelService.js';
import { buildAIPromptsUpdate } from './vendorAIConfigService.js';

export type RegistrationStatus = 'onboarding' | 'pending_approval' | 'approved' | 'rejected';

export interface OnboardingStep1Data {
  businessName: string;
  ownerName: string;
  email: string;
  category: string;
  city?: string;
  aiPickupDeliveryAddress?: string;
  aiDeliveryInstructions?: string;
}

export interface OnboardingStep3Data {
  aiBotName?: string;
  aiGreeting?: string;
  aiPersonality?: string;
  aiClosing?: string;
  aiDeliveryInstructions?: string;
  aiPickupDeliveryAddress?: string;
}

export interface OnboardingState {
  registrationStatus: RegistrationStatus;
  onboardingStep: number;
  onboardingData: Record<string, unknown> | null;
  submittedAt: string | null;
  rejectionReason: string | null;
  businessName: string;
  phone: string;
  email: string;
  category: string | null;
  trialGrantedPaise: number | null;
  trialExpiresAt: string | null;
  walletBalance: number;
}

const STEP_PATHS: Record<number, string> = {
  1: '/onboarding/catalog',
  2: '/onboarding/clarify',
  3: '/onboarding/confirm',
  4: '/onboarding/demo-chat',
  5: '/onboarding/review'
};

export function onboardingPathForStep(step: number, status: RegistrationStatus): string {
  if (status === 'pending_approval') return '/onboarding/submitted';
  if (status === 'rejected') return '/onboarding/rejected';
  if (status === 'approved') return '/dashboard';
  return STEP_PATHS[step] ?? '/onboarding/catalog';
}

export async function getOnboardingState(vendorId: string): Promise<OnboardingState> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      registrationStatus: true,
      onboardingStep: true,
      onboardingData: true,
      submittedAt: true,
      rejectionReason: true,
      businessName: true,
      phone: true,
      email: true,
      category: true,
      trialGrantedPaise: true,
      trialExpiresAt: true,
      walletBalance: true
    }
  });
  if (!vendor) {
    throw new CustomError('Vendor not found', 404, ErrorType.NOT_FOUND, ErrorSeverity.LOW);
  }

  return {
    registrationStatus: (vendor.registrationStatus ?? 'onboarding') as RegistrationStatus,
    onboardingStep: vendor.onboardingStep,
    onboardingData: vendor.onboardingData as Record<string, unknown> | null,
    submittedAt: vendor.submittedAt?.toISOString() ?? null,
    rejectionReason: vendor.rejectionReason,
    businessName: vendor.businessName,
    phone: vendor.phone,
    email: vendor.email,
    category: vendor.category,
    trialGrantedPaise: vendor.trialGrantedPaise,
    trialExpiresAt: vendor.trialExpiresAt?.toISOString() ?? null,
    walletBalance: vendor.walletBalance
  };
}

export async function patchOnboarding(
  vendorId: string,
  payload: {
    step?: number;
    data?: Record<string, unknown>;
    advance?: boolean;
  }
): Promise<OnboardingState> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      registrationStatus: true,
      onboardingStep: true,
      onboardingData: true,
      email: true
    }
  });
  if (!vendor) {
    throw new CustomError('Vendor not found', 404, ErrorType.NOT_FOUND, ErrorSeverity.LOW);
  }

  const status = vendor.registrationStatus ?? 'onboarding';
  if (status === 'approved') {
    throw new CustomError('Onboarding is already complete', 400, ErrorType.VALIDATION, ErrorSeverity.LOW);
  }

  const currentData = (vendor.onboardingData ?? {}) as Record<string, unknown>;
  const mergedData = payload.data ? { ...currentData, ...payload.data } : currentData;
  let nextStep = payload.step ?? vendor.onboardingStep;

  const step1 = mergedData.step1 as OnboardingStep1Data | undefined;
  if (step1?.email && step1.email !== vendor.email) {
    const emailTaken = await prisma.vendor.findFirst({
      where: { email: step1.email, NOT: { id: vendorId } },
      select: { id: true }
    });
    if (emailTaken) {
      throw new CustomError(
        'This email is already used by another shop',
        409,
        ErrorType.VALIDATION,
        ErrorSeverity.LOW,
        true,
        { code: 'email_already_used' }
      );
    }
  }

  const vendorUpdate: Record<string, unknown> = {
    onboardingData: mergedData
  };

  if (step1) {
    if (step1.businessName) vendorUpdate.businessName = step1.businessName;
    if (step1.email) vendorUpdate.email = step1.email;
    if (step1.category) vendorUpdate.category = step1.category;
    Object.assign(
      vendorUpdate,
      buildAIPromptsUpdate({
        pickupDeliveryAddress: step1.aiPickupDeliveryAddress,
        deliveryInstructions: step1.aiDeliveryInstructions
      })
    );
  }

  const step3 = mergedData.step3 as OnboardingStep3Data | undefined;
  if (step3) {
    Object.assign(
      vendorUpdate,
      buildAIPromptsUpdate({
        botName: step3.aiBotName,
        greeting: step3.aiGreeting,
        personality: step3.aiPersonality,
        closing: step3.aiClosing,
        deliveryInstructions: step3.aiDeliveryInstructions,
        pickupDeliveryAddress: step3.aiPickupDeliveryAddress
      })
    );
  }

  if (payload.advance) {
    nextStep = Math.min(5, (payload.step ?? vendor.onboardingStep) + 1);
    const completedEvent = (
      {
        1: 'step_1_completed',
        2: 'step_2_completed',
        3: 'step_3_completed',
        4: 'step_4_completed',
        5: 'step_5_completed'
      } as const
    )[vendor.onboardingStep as 1 | 2 | 3 | 4 | 5];
    if (completedEvent) {
      logOnboardingFunnelEvent(completedEvent, { vendorId });
    }
  }

  vendorUpdate.onboardingStep = nextStep;

  await prisma.vendor.update({
    where: { id: vendorId },
    data: vendorUpdate as object
  });

  return getOnboardingState(vendorId);
}

export async function submitForApproval(vendorId: string): Promise<OnboardingState> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { registrationStatus: true, businessName: true, email: true }
  });
  if (!vendor) {
    throw new CustomError('Vendor not found', 404, ErrorType.NOT_FOUND, ErrorSeverity.LOW);
  }

  const status = vendor.registrationStatus ?? 'onboarding';
  if (status === 'approved') {
    throw new CustomError('Already approved', 400, ErrorType.VALIDATION, ErrorSeverity.LOW);
  }
  if (status === 'pending_approval') {
    return getOnboardingState(vendorId);
  }

  if (!vendor.businessName?.trim() || !vendor.email?.trim()) {
    throw new CustomError(
      'Please complete your business details before submitting',
      400,
      ErrorType.VALIDATION,
      ErrorSeverity.LOW,
      true,
      { code: 'incomplete_profile' }
    );
  }

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      registrationStatus: 'pending_approval',
      submittedAt: new Date(),
      onboardingStep: 5
    }
  });

  logOnboardingFunnelEvent('submitted', { vendorId });

  return getOnboardingState(vendorId);
}
