import { logger } from '../logger.js';

export type OnboardingFunnelEvent =
  | 'signup_started'
  | 'otp_verified'
  | 'step_1_completed'
  | 'step_2_completed'
  | 'step_3_completed'
  | 'step_4_completed'
  | 'step_5_completed'
  | 'intake_question_answered'
  | 'intake_skipped'
  | 'sandbox_message_sent'
  | 'sandbox_voice_sent'
  | 'submitted'
  | 'approved';

export function logOnboardingFunnelEvent(
  event: OnboardingFunnelEvent,
  context: Record<string, unknown> = {}
): void {
  logger.info({ funnelEvent: event, ...context }, 'onboarding_funnel');
}
