import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button, Input } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { ChoiceChips } from '../../components/onboarding/ChoiceChips';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import {
  fetchOnboardingProfile,
  logClientFunnelEvent,
  patchOnboarding,
  type IntakeQuestion,
  type OnboardingProfile,
} from '../../lib/onboarding';

export function OnboardingClarify() {
  const navigate = useNavigate();
  const copy = onboardingCopy.clarify;
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [question, setQuestion] = useState<IntakeQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [askedIds, setAskedIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const loadProfile = async () => {
    const p = await fetchOnboardingProfile();
    setProfile(p);
    const intake = (p.onboardingData?.intake ?? {}) as {
      askedIds?: string[];
      answers?: Record<string, string>;
    };
    setAskedIds(intake.askedIds ?? []);
    setAnswers(intake.answers ?? {});

    const next = p.nextQuestions?.[0] ?? null;
    if (!next) {
      navigate('/onboarding/confirm', { replace: true });
      return;
    }
    setQuestion(next);
    setAnswer(intake.answers?.[next.id] ?? '');
  };

  useEffect(() => {
    void loadProfile().catch(() => navigate('/onboarding/catalog', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overall = profile?.completeness?.overall ?? 0;
  const ready = profile?.completeness?.readyForDemo ?? overall >= 0.8;
  const progressPct = Math.round(overall * 100);

  const persistIntake = async (nextAnswers: Record<string, string>, nextAsked: string[], advance = false) => {
    await patchOnboarding({
      step: 2,
      data: { intake: { answers: nextAnswers, askedIds: nextAsked } },
      advance,
    });
  };

  const goConfirm = async (skipped = false) => {
    setBusy(true);
    try {
      if (skipped) {
        logClientFunnelEvent('intake_skipped', { atQuestion: question?.id });
        await patchOnboarding({
          step: 2,
          data: { intake: { answers, askedIds, skipped: true } },
          advance: true,
        });
      }
      navigate('/onboarding/confirm');
    } catch (err) {
      toast.error(mapOnboardingError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    if (!question) return;
    const trimmed = answer.trim();
    if (!trimmed) {
      toast.error(copy.answerRequired);
      return;
    }
    setBusy(true);
    try {
      const nextAnswers = { ...answers, [question.id]: trimmed };
      const nextAsked = askedIds.includes(question.id) ? askedIds : [...askedIds, question.id];
      setAnswers(nextAnswers);
      setAskedIds(nextAsked);
      logClientFunnelEvent('intake_question_answered', { questionId: question.id });

      await persistIntake(nextAnswers, nextAsked, false);
      const refreshed = await fetchOnboardingProfile();
      const remaining = refreshed.nextQuestions?.[0];
      if (!remaining) {
        await patchOnboarding({ step: 2, advance: true });
        navigate('/onboarding/confirm');
        return;
      }
      setProfile(refreshed);
      setQuestion(remaining);
      setAnswer(nextAnswers[remaining.id] ?? '');
    } catch (err) {
      toast.error(mapOnboardingError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!question) {
    return (
      <OnboardingLayout step={2} guide={copy.guide}>
        <p className="text-sm text-gray-500">Loading…</p>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout step={2} guide={copy.guide}>
      <p className="mb-4 text-sm text-gray-600">
        {ready ? copy.progressReady : copy.progressBuilding.replace('{pct}', String(progressPct))}
      </p>

      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
        <p className="text-sm font-medium text-gray-900">{question.prompt}</p>
      </div>

      {question.kind === 'chips' && question.options?.length ? (
        <div className="mb-6">
          <ChoiceChips
            ariaLabel={question.prompt}
            value={answer || question.options[0]}
            options={question.options}
            onChange={setAnswer}
          />
        </div>
      ) : (
        <div className="mb-6">
          <Input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={copy.textPlaceholder}
            onKeyDown={(e) => e.key === 'Enter' && void handleContinue()}
          />
        </div>
      )}

      <div className="space-y-3">
        <Button className="w-full" onClick={() => void handleContinue()} isLoading={busy} disabled={busy}>
          {copy.continue}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full text-gray-600"
          disabled={busy}
          onClick={() => void goConfirm(true)}
        >
          {copy.enough}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
