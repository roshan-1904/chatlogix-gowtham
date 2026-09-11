import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogout } from '@chatlogix/auth';
import { Button } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OnboardingActionSkeleton } from '../../components/onboarding/OnboardingSkeleton';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { fetchOnboardingProfile, redirectPathForStatus, type OnboardingProfile } from '../../lib/onboarding';

function supportHref(): { href: string; label: string } {
  const digits = (import.meta.env.VITE_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
  if (digits) {
    return {
      href: `https://wa.me/${digits}`,
      label: onboardingCopy.rejected.contactSupport,
    };
  }
  return {
    href: onboardingCopy.rejected.contactFallbackUrl,
    label: onboardingCopy.rejected.contactFallback,
  };
}

export function OnboardingRejected() {
  const navigate = useNavigate();
  const logout = useLogout();
  const copy = onboardingCopy.rejected;
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);

  useEffect(() => {
    void fetchOnboardingProfile().then((p) => {
      if (p.registrationStatus !== 'rejected') {
        void navigate(redirectPathForStatus(p.registrationStatus, p.onboardingStep), { replace: true });
        return;
      }
      setProfile(p);
    });
  }, [navigate]);

  const handleLogout = () => {
    void logout().then(() => {
      void navigate('/login');
    });
  };

  if (!profile) {
    return (
      <OnboardingLayout step={5} hideStepper guide={copy.guide}>
        <OnboardingActionSkeleton rows={3} cta={false} />
      </OnboardingLayout>
    );
  }

  const reason = profile.rejectionReason?.trim() || copy.reasonFallback;
  const support = supportHref();

  return (
    <OnboardingLayout step={5} hideStepper guide={copy.guide}>
      <p className="mb-4 text-sm leading-relaxed text-gray-600">{copy.explainer}</p>

      <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm leading-relaxed text-red-900">{reason}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Link to="/onboarding/confirm">
          <Button className="w-full">{copy.editApplication}</Button>
        </Link>
        <Link to="/onboarding/catalog">
          <Button variant="ghost" className="w-full border border-gray-300">
            {copy.addProducts}
          </Button>
        </Link>
        <a href={support.href} target="_blank" rel="noreferrer">
          <Button variant="ghost" className="w-full border border-gray-300">
            {support.label}
          </Button>
        </a>
        <Button type="button" variant="ghost" className="w-full" onClick={handleLogout}>
          {copy.backToLogin}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
