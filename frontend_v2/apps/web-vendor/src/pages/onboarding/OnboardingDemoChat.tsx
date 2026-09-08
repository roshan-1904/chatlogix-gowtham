import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { TrialWalletBar } from '../../components/onboarding/TrialWalletBar';
import { WhatsAppDemoPhone } from '../../components/onboarding/WhatsAppDemoPhone';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import {
  fetchOnboardingProfile,
  fetchTrialWallet,
  formatRupee,
  patchOnboarding,
} from '../../lib/onboarding';

export function OnboardingDemoChat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [botName, setBotName] = useState('Shop Assistant');
  const [greeting, setGreeting] = useState<string | undefined>();
  const [demoPrompts, setDemoPrompts] = useState<string[]>([]);
  const [lastCostPaise, setLastCostPaise] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['trial-wallet'],
    queryFn: fetchTrialWallet,
    staleTime: 15_000,
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    void fetchOnboardingProfile().then((p) => {
      if (p.aiBotName?.trim()) setBotName(p.aiBotName.trim());
      if (p.aiGreeting?.trim()) setGreeting(p.aiGreeting.trim());
      if (p.demoPrompts?.length) setDemoPrompts(p.demoPrompts);
    });
  }, []);

  const refreshWallet = () => {
    void queryClient.invalidateQueries({ queryKey: ['trial-wallet'] });
  };

  const handleContinue = async () => {
    try {
      await patchOnboarding({ step: 4, advance: true });
      void navigate('/onboarding/review');
    } catch (err) {
      toast.error(mapOnboardingError(err));
    }
  };

  const walletEmpty = (wallet?.balancePaise ?? 0) <= 0;
  const lastCostLabel =
    lastCostPaise !== null && lastCostPaise > 0
      ? onboardingCopy.demoPhone.lastReplyCost.replace('{cost}', formatRupee(lastCostPaise))
      : null;

  return (
    <OnboardingLayout
      step={4}
      hideStepper={isMobile}
      demoMode
      hideWallet
      guide={onboardingCopy.step4.guide}
    >
      {isMobile && (
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-800">
              {walletLoading ? '…' : `${formatRupee(wallet?.balancePaise ?? 0)} trial`}
            </p>
            <p className="truncate text-[11px] text-gray-500">
              {lastCostLabel ?? onboardingCopy.demoPhone.demoHonesty}
            </p>
          </div>
          <Button size="sm" onClick={() => void handleContinue()}>
            {onboardingCopy.demoPhone.continue}
          </Button>
        </div>
      )}

      <div
        className={
          isMobile ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col items-center gap-4'
        }
      >
        {!isMobile && (
          <div className="w-full max-w-[390px] space-y-2">
            {wallet && (
              <TrialWalletBar
                balancePaise={wallet.balancePaise}
                grantedPaise={wallet.grantedPaise}
                expiresAt={wallet.expiresAt}
                loading={walletLoading}
                variant="compact"
              />
            )}
            {lastCostLabel && (
              <p className="text-center text-xs text-gray-500">{lastCostLabel}</p>
            )}
            <p className="text-center text-xs text-gray-500">
              {onboardingCopy.demoPhone.demoHonesty}
            </p>
          </div>
        )}

        <WhatsAppDemoPhone
          botName={botName}
          greeting={greeting}
          suggestedPrompts={demoPrompts}
          walletEmpty={walletEmpty}
          onWalletRefresh={refreshWallet}
          onLastCost={setLastCostPaise}
          framed={!isMobile}
        />

        {!isMobile && (
          <div className="flex w-full max-w-[390px] flex-col pt-2">
            <Button className="w-full" onClick={() => void handleContinue()}>
              {onboardingCopy.demoPhone.continue}
            </Button>
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}
