import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@chatlogix/auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, Input } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OnboardingActionSkeleton } from '../../components/onboarding/OnboardingSkeleton';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import {
  completeOnboarding,
  fetchOnboardingProfile,
  logClientFunnelEvent,
  patchOnboarding,
  type OnboardingProfile,
} from '../../lib/onboarding';

const emailSchema = z.object({
  email: z.string().email('Enter a valid email'),
});

function editApplicationPath(productCount?: number): string {
  return (productCount ?? 0) > 0 ? '/onboarding/confirm' : '/onboarding/catalog';
}

function productLabel(count: number): string {
  if (count <= 0) return onboardingCopy.review.noProducts;
  if (count === 1) return onboardingCopy.review.productOne;
  return onboardingCopy.review.products.replace('{count}', String(count));
}

export function OnboardingReview() {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailForm = useForm<{ email: string }>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    void fetchOnboardingProfile()
      .then((p) => {
        setProfile(p);
        const needsEmail = !p.email?.trim();
        setShowEmailForm(needsEmail);
        if (needsEmail) {
          emailForm.reset({ email: '' });
        }
      })
      .catch((err) => {
        setError(mapOnboardingError(err));
      });
  }, [emailForm]);

  const handleSubmit = async () => {
    if (!profile) return;
    setError(null);

    let nextProfile = profile;
    if (showEmailForm) {
      const valid = await emailForm.trigger();
      if (!valid) return;
      setSubmitting(true);
      try {
        const email = emailForm.getValues('email').trim();
        nextProfile = await patchOnboarding({
          step: 5,
          data: { email },
          advance: false,
        });
        setProfile(nextProfile);
        setShowEmailForm(false);
      } catch (err) {
        setError(mapOnboardingError(err));
        setSubmitting(false);
        return;
      }
    } else {
      setSubmitting(true);
    }

    try {
      await completeOnboarding();
      logClientFunnelEvent('review_completed', { vendor: nextProfile.businessName });
      await refreshAuth();
      void navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(mapOnboardingError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const copy = onboardingCopy.review;
  const productCount = profile?.productCount ?? 0;
  const greeting = profile?.aiGreeting?.trim() || copy.greetingFallback;

  return (
    <OnboardingLayout step={5} guide={onboardingCopy.step5.guide}>
      {!profile ? (
        error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <OnboardingActionSkeleton rows={2} />
        )
      ) : (
        <>
          {showEmailForm && (
            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="onboarding-review-email">
                {copy.emailLabel}
              </label>
              <Input
                id="onboarding-review-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...emailForm.register('email')}
                error={emailForm.formState.errors.email?.message}
              />
              <p className="mt-1 text-xs leading-snug text-gray-500">{copy.emailRequired}</p>
            </div>
          )}

          <Card className="mb-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900">{profile.businessName || '—'}</p>
                <p className="mt-1 text-sm text-gray-600">{productLabel(productCount)}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-700">“{greeting}”</p>
              </div>
              <Link
                to={editApplicationPath(productCount)}
                className="shrink-0 text-sm font-medium text-primary-600"
              >
                {copy.editDetails}
              </Link>
            </div>
          </Card>

          <p className="mb-6 text-sm leading-relaxed text-gray-600">{onboardingCopy.step5.promise}</p>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <Button className="w-full" disabled={submitting} isLoading={submitting} onClick={() => void handleSubmit()}>
            {onboardingCopy.step5.submitCta}
          </Button>
        </>
      )}
    </OnboardingLayout>
  );
}
