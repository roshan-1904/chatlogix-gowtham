import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button, Input } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OnboardingActionSkeleton } from '../../components/onboarding/OnboardingSkeleton';
import { ChoiceChips } from '../../components/onboarding/ChoiceChips';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import {
  fetchOnboardingProfile,
  logClientFunnelEvent,
  patchOnboarding,
  type IntakeQuestion,
} from '../../lib/onboarding';

const METER_TOTAL = 5;

function whyThisQuestion(questionId: string): string {
  const copy = onboardingCopy.clarify;
  if (questionId === 'fulfillment' || questionId === 'deliveryArea' || questionId === 'addressOrCity') {
    return copy.whyDelivery;
  }
  if (questionId === 'hours') return copy.whyHours;
  if (questionId === 'productPrices') return copy.whyPrice;
  return copy.whyDefault;
}

export function OnboardingClarify() {
  const navigate = useNavigate();
  const copy = onboardingCopy.clarify;
  const [question, setQuestion] = useState<IntakeQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [askedIds, setAskedIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [panelVisible, setPanelVisible] = useState(true);

  const loadProfile = async () => {
    const p = await fetchOnboardingProfile();
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

  const persistIntake = async (nextAnswers: Record<string, string>, nextAsked: string[], advance = false) => {
    await patchOnboarding({
      step: 2,
      data: { intake: { answers: nextAnswers, askedIds: nextAsked } },
      advance,
    });
  };

  const revealNextQuestion = (next: IntakeQuestion, nextAnswers: Record<string, string>) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setQuestion(next);
      setAnswer(nextAnswers[next.id] ?? '');
      setPanelVisible(true);
      return;
    }
    setPanelVisible(false);
    window.setTimeout(() => {
      setQuestion(next);
      setAnswer(nextAnswers[next.id] ?? '');
      setPanelVisible(true);
    }, 160);
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
      revealNextQuestion(remaining, nextAnswers);
    } catch (err) {
      toast.error(mapOnboardingError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!question) {
    return (
      <OnboardingLayout step={2} guide={copy.guide}>
        <OnboardingActionSkeleton rows={2} />
      </OnboardingLayout>
    );
  }

  const current = askedIds.length + 1;
  const total = Math.max(METER_TOTAL, current);
  const answered = answer.trim().length > 0;
  const meterPct = Math.max(8, Math.round((current / total) * 100));

  return (
    <OnboardingLayout step={2} guide={copy.guide}>
      <div className="mb-5">
        <p className="text-sm font-medium text-gray-900">
          {copy.progressMeter.replace('{current}', String(current)).replace('{total}', String(total))}
        </p>
        <p className="mt-1 text-sm text-gray-500">{whyThisQuestion(question.id)}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full bg-primary-500 transition-all duration-300" style={{ width: `${meterPct}%` }} />
        </div>
      </div>

      <div
        className={`transition-opacity duration-200 motion-reduce:transition-none ${
          panelVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
          <p className="text-sm font-medium text-gray-900">{question.prompt}</p>
        </div>

        {question.kind === 'chips' && question.options?.length ? (
          <div className="mb-6">
            <ChoiceChips
              ariaLabel={question.prompt}
              value={answer}
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
              onKeyDown={(e) => e.key === 'Enter' && answered && void handleContinue()}
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Button
          className="w-full"
          onClick={() => void handleContinue()}
          isLoading={busy}
          disabled={busy || !answered}
        >
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
