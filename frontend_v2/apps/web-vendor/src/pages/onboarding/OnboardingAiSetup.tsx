import { Navigate } from 'react-router-dom';

/** Legacy route — AI setup is merged into confirm. */
export function OnboardingAiSetup() {
  return <Navigate to="/onboarding/confirm" replace />;
}
