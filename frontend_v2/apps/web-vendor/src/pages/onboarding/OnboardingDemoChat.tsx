import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { WhatsAppDemoPhone } from '../../components/onboarding/WhatsAppDemoPhone';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import {
  fetchOnboardingProfile,
  fetchTrialWallet,
  formatRupee,
  formatTrialLeft,
  patchOnboarding,
} from '../../lib/onboarding';
import { getProducts } from '../../lib/products';

function chipsFromProductNames(names: string[]): string[] {
  const first = names[0];
  const second = names[1];
  const prompts: string[] = [];
  if (first) prompts.push(`How much is ${first}?`);
  if (second) prompts.push(`Do you have ${second}?`);
  else if (first) prompts.push(`Do you have ${first}?`);
  return prompts;
}

function catalogSkipped(data: Record<string, unknown> | null | undefined, productCount?: number): boolean {
  const catalog = data?.catalog as { skipped?: boolean } | undefined;
  if (catalog?.skipped) return true;
  return (productCount ?? 0) === 0;
}

export function OnboardingDemoChat() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [botName, setBotName] = useState('Shop Assistant');
  const [greeting, setGreeting] = useState<string | undefined>();
  const [demoPrompts, setDemoPrompts] = useState<string[]>([]);
  const [lastCostPaise, setLastCostPaise] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [heardReply, setHeardReply] = useState(false);
  const [skippedCatalog, setSkippedCatalog] = useState(false);

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
    void (async () => {
      const p = await fetchOnboardingProfile();
      if (p.aiBotName?.trim()) setBotName(p.aiBotName.trim());
      if (p.aiGreeting?.trim()) setGreeting(p.aiGreeting.trim());
      setSkippedCatalog(catalogSkipped(p.onboardingData, p.productCount));

      if (p.demoPrompts?.length) {
        setDemoPrompts(p.demoPrompts);
        return;
      }
      if ((p.productCount ?? 0) <= 0) return;

      const again = await fetchOnboardingProfile();
      if (again.demoPrompts?.length) {
        setDemoPrompts(again.demoPrompts);
        return;
      }
      try {
        const { products } = await getProducts({ pageSize: 4 });
        setDemoPrompts(chipsFromProductNames(products.map((item) => item.name).filter(Boolean)));
      } catch {
        // Keep generic chips inside the phone.
      }
    })();
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
  const continuePrimary = heardReply || walletEmpty || skippedCatalog;
  const lastCostLabel =
    lastCostPaise !== null && lastCostPaise > 0
      ? onboardingCopy.demoPhone.lastReplyCost.replace('{cost}', formatRupee(lastCostPaise))
      : null;
  const trialLabel = walletLoading ? '…' : formatTrialLeft(wallet?.balancePaise ?? 0);

  const continueButton = (
    <Button
      size={isMobile ? 'sm' : 'md'}
      variant={continuePrimary ? 'primary' : 'ghost'}
      className={isMobile ? undefined : 'w-full'}
      onClick={() => void handleContinue()}
    >
      {onboardingCopy.demoPhone.continue}
    </Button>
  );

  return (
    <OnboardingLayout
      step={4}
      hideStepper={isMobile}
      demoMode
      hideWallet
      splitEven
      guide={onboardingCopy.step4.guide}
    >
      {isMobile && (
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-800">{trialLabel}</p>
            <p className="truncate text-[11px] text-gray-500">
              {lastCostLabel ?? onboardingCopy.demoPhone.demoHonesty}
            </p>
          </div>
          {continueButton}
        </div>
      )}

      <div
        className={
          isMobile ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col items-center gap-4'
        }
      >
        {!isMobile && (
          <div className="w-full max-w-[390px] space-y-2">
            <p className="text-center text-sm font-medium text-primary-800">{trialLabel}</p>
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
          onAssistantReply={() => setHeardReply(true)}
          framed={!isMobile}
        />

        {!isMobile && <div className="flex w-full max-w-[390px] flex-col pt-2">{continueButton}</div>}
      </div>
    </OnboardingLayout>
  );
}
