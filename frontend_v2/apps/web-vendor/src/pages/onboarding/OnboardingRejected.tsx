import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogout } from '@chatlogix/auth';
import { BrandLogo, Button } from '@chatlogix/ui';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { fetchOnboardingProfile, redirectPathForStatus } from '../../lib/onboarding';
import { NeedHelpFooter } from '../../components/onboarding/NeedHelpFooter';

export function OnboardingRejected() {
  const navigate = useNavigate();
  const logout = useLogout();
  const [reason, setReason] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetchOnboardingProfile().then((p) => {
      if (p.registrationStatus !== 'rejected') {
        navigate(redirectPathForStatus(p.registrationStatus, p.onboardingStep), { replace: true });
        return;
      }
      setReason(p.rejectionReason);
      setReady(true);
    });
  }, [navigate]);

  const handleLogout = () => {
    void logout().then(() => {
      navigate('/login');
    });
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-gray-200 px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center">
            <BrandLogo className="h-8 w-auto" />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleLogout}>
            {onboardingCopy.help.logout}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          {onboardingCopy.rejected.headline}
        </h1>
        <p className="mt-2 text-base text-gray-500">{onboardingCopy.rejected.explainer}</p>
        {reason && (
          <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-left text-sm text-red-900">{reason}</p>
        )}
        <Link to="/login" className="mt-8 inline-block w-full">
          <Button className="w-full">Back to login</Button>
        </Link>
      </main>
      <NeedHelpFooter />
    </div>
  );
}
