import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OnboardingActionSkeleton } from '../../components/onboarding/OnboardingSkeleton';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { fetchOnboardingProfile, redirectPathForStatus, type OnboardingProfile } from '../../lib/onboarding';

function editApplicationPath(productCount?: number): string {
  return (productCount ?? 0) > 0 ? '/onboarding/confirm' : '/onboarding/catalog';
}

type TimelineState = 'done' | 'current' | 'upcoming';

export function OnboardingSubmitted() {
  const navigate = useNavigate();
  const copy = onboardingCopy.submitted;
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shown'>('idle');

  useEffect(() => {
    void fetchOnboardingProfile().then((p) => {
      if (p.registrationStatus !== 'pending_approval') {
        void navigate(redirectPathForStatus(p.registrationStatus, p.onboardingStep), { replace: true });
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

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(copy.sharePartnerText);
      setShareStatus('copied');
    } catch {
      setShareStatus('shown');
    }
  };

  const timeline: Array<{ label: string; state: TimelineState }> = [
    { label: copy.timeline.submitted, state: 'done' },
    { label: copy.timeline.inReview, state: 'current' },
    { label: copy.timeline.approved, state: 'upcoming' },
    { label: copy.timeline.connect, state: 'upcoming' },
  ];

  if (!profile) {
    return (
      <OnboardingLayout step={5} allComplete guide={copy.guide}>
        <OnboardingActionSkeleton rows={4} cta={false} />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout step={5} allComplete guide={copy.guide}>
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-secondary-50 text-secondary-600">
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <p className="mb-2 text-base leading-relaxed text-gray-600">
        {profile.businessName ? `Thanks, ${profile.businessName}. ` : 'Thanks. '}
        {copy.explainer}
      </p>
      {profile.phone ? (
        <p className="mb-2 text-sm text-gray-600">{copy.notifyAt.replace('{phone}', profile.phone)}</p>
      ) : null}
      {submittedDate ? (
        <p className="mb-6 text-sm text-gray-500">{copy.submittedOn.replace('{date}', submittedDate)}</p>
      ) : (
        <div className="mb-6" />
      )}

      <ol className="mb-8" aria-label={copy.guide.actionTitle}>
        {timeline.map((item, index) => {
          const isLast = index === timeline.length - 1;
          return (
            <li key={item.label} className="flex gap-3" aria-current={item.state === 'current' ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    item.state === 'done'
                      ? 'bg-primary-500 text-white'
                      : item.state === 'current'
                        ? 'bg-secondary-500 text-white'
                        : 'border border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  {item.state === 'done' ? '✓' : index + 1}
                </span>
                {!isLast && (
                  <span
                    className={`my-1 w-px flex-1 min-h-[1.25rem] ${
                      item.state === 'done' ? 'bg-primary-500' : 'bg-gray-200'
                    }`}
                    aria-hidden
                  />
                )}
              </div>
              <p
                className={`pb-5 pt-1 text-sm ${
                  item.state === 'upcoming' ? 'text-gray-400' : 'font-medium text-gray-900'
                } ${isLast ? 'pb-0' : ''}`}
              >
                {item.label}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">{copy.whileYouWait}</p>
      <div className="mb-6 space-y-3">
        <Link to="/onboarding/demo-chat" className="block">
          <Card>
            <p className="text-sm font-semibold text-gray-900">{copy.tryDemo}</p>
            <p className="mt-0.5 text-sm text-gray-500">{copy.tryDemoHint}</p>
          </Card>
        </Link>
        <Link to="/onboarding/catalog" className="block">
          <Card>
            <p className="text-sm font-semibold text-gray-900">{copy.addProducts}</p>
            <p className="mt-0.5 text-sm text-gray-500">{copy.addProductsHint}</p>
          </Card>
        </Link>
        <button type="button" onClick={() => void handleShare()} className="block w-full text-left">
          <Card>
            <p className="text-sm font-semibold text-gray-900">{copy.sharePartner}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              {shareStatus === 'copied' ? copy.shareCopied : copy.sharePartnerHint}
            </p>
            {shareStatus === 'shown' ? (
              <p className="mt-2 select-all text-sm text-gray-700">{copy.sharePartnerText}</p>
            ) : null}
          </Card>
        </button>
      </div>

      <Link to={editApplicationPath(profile.productCount)}>
        <Button variant="ghost" className="w-full border border-gray-300">
          {copy.editApplication}
        </Button>
      </Link>
    </OnboardingLayout>
  );
}
