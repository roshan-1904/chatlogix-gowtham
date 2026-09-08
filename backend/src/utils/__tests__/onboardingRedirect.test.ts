import { describe, it, expect } from 'vitest';
import { getOnboardingRedirectPath } from '../../utils/onboardingRedirect.js';

describe('getOnboardingRedirectPath', () => {
  it('routes approved vendors to dashboard', () => {
    expect(getOnboardingRedirectPath('approved', 1)).toBe('/dashboard');
  });

  it('routes pending approval to submitted page', () => {
    expect(getOnboardingRedirectPath('pending_approval', 3)).toBe('/onboarding/submitted');
  });

  it('routes rejected vendors to rejected page', () => {
    expect(getOnboardingRedirectPath('rejected', 2)).toBe('/onboarding/rejected');
  });

  it('routes onboarding vendors to saved step', () => {
    expect(getOnboardingRedirectPath('onboarding', 1)).toBe('/onboarding/catalog');
    expect(getOnboardingRedirectPath('onboarding', 2)).toBe('/onboarding/clarify');
    expect(getOnboardingRedirectPath('onboarding', 3)).toBe('/onboarding/confirm');
    expect(getOnboardingRedirectPath('onboarding', 4)).toBe('/onboarding/demo-chat');
    expect(getOnboardingRedirectPath('onboarding', 99)).toBe('/onboarding/review');
  });
});
