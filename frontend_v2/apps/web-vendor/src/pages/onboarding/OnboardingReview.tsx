import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Button, Input } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import {
  fetchOnboardingProfile,
  fetchTrialWallet,
  formatRupee,
  patchOnboarding,
  submitForApproval,
} from '../../lib/onboarding';

const emailSchema = z.object({
  email: z.string().email('Enter a valid email'),
});

export function OnboardingReview() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchOnboardingProfile>> | null>(null);
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof fetchTrialWallet>> | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  const emailForm = useForm<{ email: string }>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    void Promise.all([fetchOnboardingProfile(), fetchTrialWallet()]).then(([p, w]) => {
      setProfile(p);
      setWallet(w);
      const needsEmail = !p.email?.trim();
      setShowEmailForm(needsEmail);
      if (needsEmail) {
        emailForm.reset({ email: '' });
      }
    });
  }, [emailForm]);

  const handleSubmit = async () => {
    if (!agreed) {
      toast.error('Please confirm you understand approval is required.');
      return;
    }
    if (showEmailForm) {
      const valid = await emailForm.trigger();
      if (!valid) return;
      setSubmitting(true);
      try {
        await patchOnboarding({
          step: 5,
          data: { email: emailForm.getValues('email') },
          advance: false,
        });
      } catch (err) {
        toast.error(mapOnboardingError(err));
        setSubmitting(false);
        return;
      }
    } else {
      setSubmitting(true);
    }
    try {
      await submitForApproval();
      toast.success('Submitted for review!');
      navigate('/onboarding/submitted');
    } catch (err) {
      toast.error(mapOnboardingError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const usedPaise = wallet ? wallet.grantedPaise - wallet.balancePaise : 0;

  return (
    <OnboardingLayout step={5} guide={onboardingCopy.step5.guide}>

      {showEmailForm && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="mb-3 text-sm text-gray-800">{onboardingCopy.review.emailRequired}</p>
          <Input
            type="email"
            placeholder="you@example.com"
            {...emailForm.register('email')}
            error={emailForm.formState.errors.email?.message}
          />
        </div>
      )}

      <div className="mb-6 space-y-3">
        <SummaryCard title="Business" status="done" editTo="/onboarding/confirm">
          {profile?.businessName || '—'}
          <br />
          <span className="text-sm text-gray-500">{profile?.email || onboardingCopy.review.emailMissing}</span>
          {profile?.aiPickupDeliveryAddress ? (
            <>
              <br />
              <span className="text-sm text-gray-500">{profile.aiPickupDeliveryAddress}</span>
            </>
          ) : null}
        </SummaryCard>
        <SummaryCard title="Catalog" status={profile?.productCount ? 'done' : 'skipped'} editTo="/onboarding/catalog">
          {profile?.productCount ? `${profile.productCount} products` : 'Skipped or in progress'}
        </SummaryCard>
        <SummaryCard title="AI settings" status="done" editTo="/onboarding/confirm">
          {profile?.aiBotName ?? 'Default assistant'}
        </SummaryCard>
        <SummaryCard title="Trial usage" status="done">
          {formatRupee(usedPaise)} used of {formatRupee(wallet?.grantedPaise ?? 10000)}
        </SummaryCard>
      </div>

      <label className="mb-4 flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600"
        />
        {onboardingCopy.step5.checkbox}
      </label>

      <Button className="w-full" disabled={submitting} isLoading={submitting} onClick={() => void handleSubmit()}>
        {onboardingCopy.step5.submitCta}
      </Button>
    </OnboardingLayout>
  );
}

function SummaryCard({
  title,
  children,
  editTo,
  status,
}: {
  title: string;
  children: ReactNode;
  editTo?: string;
  status: 'done' | 'skipped';
}) {
  return (
    <div className="flex justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            status === 'done' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {status === 'done' ? '✓' : '–'}
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
          <div className="mt-1 text-sm text-gray-900">{children}</div>
        </div>
      </div>
      {editTo && (
        <Link to={editTo} className="shrink-0 text-sm font-medium text-primary-600">
          Edit
        </Link>
      )}
    </div>
  );
}
