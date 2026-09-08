const STEP_PATHS = ['catalog', 'clarify', 'confirm', 'demo-chat', 'review'] as const;

export function getOnboardingRedirectPath(registrationStatus: string, onboardingStep: number): string {
  switch (registrationStatus) {
    case 'approved':
      return '/dashboard';
    case 'pending_approval':
      return '/onboarding/submitted';
    case 'rejected':
      return '/onboarding/rejected';
    default:
      return `/onboarding/${STEP_PATHS[Math.max(0, Math.min(onboardingStep - 1, STEP_PATHS.length - 1))]}`;
  }
}

export function isPortalRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/conversations') ||
    pathname.startsWith('/catalog') ||
    pathname.startsWith('/faqs') ||
    pathname.startsWith('/settings')
  );
}

export function isOnboardingRoute(pathname: string): boolean {
  return pathname.startsWith('/onboarding');
}
