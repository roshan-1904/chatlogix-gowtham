import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchOnboardingProfile, pathForLegacyWelcome } from '../../lib/onboarding';

/** Legacy route — redirects into the intake-first funnel. */
export function OnboardingWelcome() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    void fetchOnboardingProfile()
      .then((p) => setTarget(pathForLegacyWelcome(p)))
      .catch(() => setTarget('/onboarding/catalog'));
  }, []);

  if (!target) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  return <Navigate to={target} replace />;
}
