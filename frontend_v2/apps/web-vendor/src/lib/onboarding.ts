import { apiClient } from './api';
import type { RegistrationStatus } from '@chatlogix/auth';
import { formatWalletAmount, formatWalletRupees } from '../utils/currency';

/** Trial money is wallet money: millirupees, not paise. */
export function formatRupee(milli: number): string {
  return formatWalletAmount(milli);
}

/** Wallet chrome shows whole rupees: "₹87 trial left", never "₹87.00 trial". */
export function formatTrialLeft(milli: number): string {
  return `${formatWalletRupees(Math.max(0, milli))} trial left`;
}

export interface ExtractedField<T = string> {
  value: T | null;
  confidence: number;
}

export interface ExtractedProfile {
  businessName?: ExtractedField;
  category?: ExtractedField;
  address?: ExtractedField;
  city?: ExtractedField;
  hours?: ExtractedField;
  deliveryNotes?: ExtractedField;
  languageHint?: ExtractedField;
}

export interface OnboardingCompleteness {
  store: number;
  products: number;
  overall: number;
  readyForDemo: boolean;
  missing: string[];
}

export type IntakeQuestionKind = 'chips' | 'text' | 'price_list';

export interface IntakeQuestion {
  id: string;
  prompt: string;
  kind: IntakeQuestionKind;
  options?: string[];
}

export interface OnboardingProfile {
  registrationStatus: RegistrationStatus;
  onboardingStep: number;
  onboardingData: Record<string, unknown> | null;
  submittedAt: string | null;
  rejectionReason: string | null;
  businessName: string;
  phone: string;
  email: string;
  category: string | null;
  walletBalanceMilli: number;
  trialGrantedMilli: number | null;
  trialExpiresAt: string | null;
  resumePath?: string;
  productCount?: number;
  aiBotName?: string | null;
  aiGreeting?: string | null;
  aiPersonality?: string | null;
  aiPickupDeliveryAddress?: string | null;
  aiDeliveryInstructions?: string | null;
  completeness?: OnboardingCompleteness;
  nextQuestions?: IntakeQuestion[];
  extractedProfile?: ExtractedProfile | null;
  demoPrompts?: string[];
}

export async function fetchOnboardingProfile(): Promise<OnboardingProfile> {
  return apiClient.get<OnboardingProfile>('/vendors/me/onboarding');
}

export async function fetchTrialWallet(): Promise<TrialWalletResponse> {
  return apiClient.get<TrialWalletResponse>('/vendors/me/trial-wallet');
}

export async function patchOnboarding(body: {
  step: number;
  data?: Record<string, unknown>;
  advance?: boolean;
}): Promise<OnboardingProfile> {
  return apiClient.patch<OnboardingProfile>('/vendors/me/onboarding', body);
}

export async function submitForApproval(): Promise<{ registrationStatus: string; submittedAt: string }> {
  return apiClient.post('/vendors/me/submit-for-approval', {});
}

export async function sandboxChat(text: string): Promise<{
  response: string;
  costMilli: number;
  durationMs: number;
}> {
  return apiClient.post('/vendors/me/sandbox/chat', { text });
}

export interface SandboxVoiceResponse {
  transcript?: string;
  response: string;
  costMilli: number;
  durationMs: number;
}

export async function sandboxVoice(audio: Blob): Promise<SandboxVoiceResponse> {
  const token = (await import('@chatlogix/auth')).tokenStorage.getToken();
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
  const res = await fetch(`${base}/vendors/me/sandbox/voice`, {
    method: 'POST',
    headers: {
      'Content-Type': audio.type || 'audio/webm',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: audio,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(err.message || err.error || 'Voice demo failed');
  }
  return (await res.json()) as SandboxVoiceResponse;
}

export interface TrialWalletResponse {
  balanceMilli: number;
  grantedMilli: number;
  expiresAt: string | null;
  breakdown: Array<{ source: string; label: string; milli: number; count?: number; jobs?: number }>;
}

/** Intake-first funnel: catalog → clarify → confirm → demo → review */
export const STEP_ROUTES: Record<number, string> = {
  1: '/onboarding/catalog',
  2: '/onboarding/clarify',
  3: '/onboarding/confirm',
  4: '/onboarding/demo-chat',
  5: '/onboarding/review',
};

export const ONBOARDING_STEP_LABELS = ['Catalog', 'Details', 'Confirm', 'Demo', 'Submit'] as const;

export function redirectPathForStatus(
  status: RegistrationStatus | undefined,
  step = 1
): string {
  switch (status) {
    case 'approved':
      return '/dashboard';
    case 'pending_approval':
      return '/onboarding/submitted';
    case 'rejected':
      return '/onboarding/rejected';
    case 'onboarding':
    default:
      return STEP_ROUTES[step] ?? '/onboarding/catalog';
  }
}

/** After catalog save/skip — clarify if questions remain, else confirm. */
export function pathAfterCatalog(profile: OnboardingProfile): string {
  const questions = profile.nextQuestions ?? [];
  if (questions.length > 0) {
    return '/onboarding/clarify';
  }
  return '/onboarding/confirm';
}

/** Legacy welcome redirect: catalog if no products, else confirm. */
export function pathForLegacyWelcome(profile: OnboardingProfile): string {
  if ((profile.productCount ?? 0) > 0) {
    return pathAfterCatalog(profile);
  }
  return '/onboarding/catalog';
}

export function logClientFunnelEvent(event: string, detail?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.info('[onboarding_funnel]', event, detail);
  }
}
