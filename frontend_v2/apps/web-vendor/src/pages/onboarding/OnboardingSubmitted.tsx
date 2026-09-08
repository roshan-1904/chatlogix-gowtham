import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { fetchOnboardingProfile, redirectPathForStatus } from '../../lib/onboarding';

export function OnboardingSubmitted() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchOnboardingProfile>> | null>(null);

  useEffect(() => {
    void fetchOnboardingProfile().then((p) => {
      if (p.registrationStatus !== 'pending_approval') {
        navigate(redirectPathForStatus(p.registrationStatus, p.onboardingStep), { replace: true });
        return;
      }
      setProfile(p);
    });
  }, [navigate]);

  const submittedDate = profile?.submittedAt
    ? new Date(profile.submittedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  if (!profile) {
    return (
      <OnboardingLayout step={5} allComplete guide={onboardingCopy.submitted.guide}>
        <p className="text-sm text-gray-500">Loading…</p>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout step={5} allComplete guide={onboardingCopy.submitted.guide}>
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-secondary-50 text-secondary-600">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="mb-6 text-base leading-relaxed text-gray-600">
        Thanks{profile.businessName ? `, ${profile.businessName}` : ''}. {onboardingCopy.submitted.explainer}
        {profile.phone && (
          <>
            {' '}
            We will notify you at <strong>{profile.phone}</strong>.
          </>
        )}
      </p>
      {submittedDate && <p className="mb-6 text-sm text-gray-500">Submitted on {submittedDate}</p>}

      <div className="flex flex-col gap-2">
        <Link to="/onboarding/welcome">
          <Button variant="ghost" className="w-full border border-gray-300">
            Edit application
          </Button>
        </Link>
        <Link to="/onboarding/demo-chat">
          <Button variant="ghost" className="w-full border border-gray-300">
            Try demo chat again
          </Button>
        </Link>
      </div>
    </OnboardingLayout>
  );
}
