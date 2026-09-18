import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button, Card } from '@chatlogix/ui';
import { useAuth } from '@chatlogix/auth';
import { ConnectPathCards } from '../../components/whatsapp/ConnectPathCards';
import { ConnectStatusPanel } from '../../components/whatsapp/ConnectStatusPanel';
import { WhatsAppConnectLayout } from '../../components/whatsapp/WhatsAppConnectLayout';
import { WhatsAppConnectSkeleton } from '../../components/whatsapp/WhatsAppConnectSkeleton';
import {
  completeWhatsAppConnect,
  getWhatsAppEmbeddedConfig,
  getWhatsAppStatus,
  launchEmbeddedSignup,
  listenEmbeddedSignupSession,
  loadFacebookSdk,
  retryWhatsAppCreditAttach,
  type WhatsAppConnectPath,
  type WhatsAppStatus,
} from '../../lib/whatsappConnect';

type WizardStep = 'intro' | 'path' | 'preflight' | 'connecting' | 'status';

function statusHeadline(status: WhatsAppStatus | undefined): string {
  switch (status?.connectStatus) {
    case 'live':
      return 'You’re live';
    case 'credit_attached':
      return status.walletCanReply
        ? 'Almost there — send a test message'
        : 'Add money to go live';
    case 'meta_in_progress':
      return 'Turning on messages…';
    case 'error':
      return 'Something went wrong';
    default:
      return 'Connect your shop WhatsApp';
  }
}

const PAGE_DESCRIPTION =
  'Customers will WhatsApp your shop number. Message charges come from your ChatLogix wallet — you don\'t pay Meta separately.';

export function WhatsAppConnect() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('intro');
  const [connectPath, setConnectPath] = useState<WhatsAppConnectPath | null>(null);
  const [personalBlocked, setPersonalBlocked] = useState(false);
  const sessionRef = useRef<{ wabaId?: string; phoneNumberId?: string; businessId?: string }>({});

  const configQuery = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: getWhatsAppEmbeddedConfig,
    enabled: !!user?.vendorId,
  });

  const statusQuery = useQuery({
    queryKey: ['whatsapp-status', user?.vendorId],
    queryFn: getWhatsAppStatus,
    enabled: !!user?.vendorId,
    refetchInterval: (query) => {
      const s = query.state.data?.connectStatus;
      if (s === 'live') return false;
      if (s === 'credit_attached' || s === 'meta_in_progress') return 3000;
      return false;
    },
  });

  const status = statusQuery.data;

  useEffect(() => {
    if (status?.connectStatus === 'live') {
      setStep('status');
    } else if (
      status?.connectStatus &&
      ['credit_attached', 'meta_in_progress', 'error'].includes(status.connectStatus)
    ) {
      setStep('status');
    }
  }, [status?.connectStatus]);

  useEffect(() => {
    const appId = configQuery.data?.appId;
    if (!appId) return;
    void loadFacebookSdk(appId).catch(() => {
      toast.error('Could not load Facebook. Check your connection.');
    });
  }, [configQuery.data?.appId]);

  useEffect(() => {
    return listenEmbeddedSignupSession((session) => {
      sessionRef.current = {
        wabaId: session.wabaId,
        phoneNumberId: session.phoneNumberId,
        businessId: session.businessId,
      };
    });
  }, []);

  const completeMutation = useMutation({
    mutationFn: completeWhatsAppConnect,
    onSuccess: (data) => {
      void queryClient.setQueryData(['whatsapp-status', user?.vendorId], data);
      setStep('status');
      toast.success('Your number is saved');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Connect failed');
      void statusQuery.refetch();
      setStep('status');
    },
  });

  const retryMutation = useMutation({
    mutationFn: retryWhatsAppCreditAttach,
    onSuccess: (data) => {
      void queryClient.setQueryData(['whatsapp-status', user?.vendorId], data);
      toast.success('Billing link retried');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    },
  });

  const startMetaConnect = useCallback(async () => {
    const config = configQuery.data;
    if (!config?.configured || !config.configId || !config.appId) {
      toast.error('WhatsApp connect is not configured on the server yet.');
      return;
    }
    if (!connectPath) {
      toast.error('Pick how your number is set up first.');
      return;
    }
    setStep('connecting');
    try {
      await loadFacebookSdk(config.appId);
      const { code } = await launchEmbeddedSignup(config.configId);
      const session = sessionRef.current;
      if (!session.wabaId || !session.phoneNumberId) {
        throw new Error('Meta did not return your number details. Try again.');
      }
      await completeMutation.mutateAsync({
        code,
        waba_id: session.wabaId,
        phone_number_id: session.phoneNumberId,
        business_id: session.businessId,
        connectPath,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection wasn’t finished.');
      setStep('preflight');
    }
  }, [completeMutation, configQuery.data, connectPath]);

  const lowBalanceHint = useMemo(() => {
    if (!status || status.walletCanReply) return null;
    return 'Customers can message you, but the assistant won’t reply until you add money.';
  }, [status]);

  if (statusQuery.isLoading) {
    return <WhatsAppConnectSkeleton />;
  }

  const headline = statusHeadline(status);

  return (
    <WhatsAppConnectLayout activeStep={step} headline={headline} description={PAGE_DESCRIPTION}>
      {lowBalanceHint && status?.connectStatus !== 'not_started' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {lowBalanceHint}{' '}
          <Link to="/wallet" className="font-medium text-primary-500 underline">
            Add money
          </Link>
        </div>
      )}

      {step === 'intro' && (
        <Card className="space-y-4 rounded-xl p-4 shadow-sm sm:p-5">
          <p className="text-sm text-gray-700">
            Pick the phone number your customers will message — not the number you use to log in here.
          </p>
          <Button variant="primary" className="w-full sm:w-auto" onClick={() => setStep('path')}>
            Continue
          </Button>
        </Card>
      )}

      {step === 'path' && (
        <Card className="rounded-xl p-4 shadow-sm sm:p-5">
          <ConnectPathCards
            selected={connectPath}
            onSelect={(path) => {
              setConnectPath(path);
              setPersonalBlocked(false);
              setStep('preflight');
            }}
            onPersonalWhatsApp={() => {
              setPersonalBlocked(true);
              setConnectPath(null);
            }}
            personalBlocked={personalBlocked}
          />
        </Card>
      )}

      {step === 'preflight' && (
        <Card className="space-y-4 rounded-xl p-4 text-sm text-gray-700 shadow-sm sm:p-5">
          <ul className="space-y-2">
            {[
              { title: 'Have your Facebook login ready', hint: 'You will sign in through Meta.' },
              { title: 'Keep your phone nearby for OTP', hint: 'Meta may verify your number.' },
              { title: 'Allow pop-ups in this browser', hint: 'The Meta window must open.' },
              { title: 'Keep the Facebook window open', hint: 'Wait until Meta finishes setup.' },
            ].map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-secondary-500 text-white">
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M2.5 6.5 5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="text-xs text-gray-500">{item.hint}</div>
                </div>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            className="w-full bg-secondary-500 hover:bg-secondary-500/90 border-0 sm:w-auto"
            onClick={() => void startMetaConnect()}
            isLoading={completeMutation.isPending}
          >
            Connect with Meta
          </Button>
        </Card>
      )}

      {step === 'connecting' && (
        <Card className="rounded-xl p-4 text-sm text-gray-600 shadow-sm sm:p-5">
          <p className="font-medium text-primary-500">Saving your number…</p>
          <p className="mt-1">Complete the Facebook window if it&apos;s still open.</p>
        </Card>
      )}

      {step === 'status' && status && (
        <ConnectStatusPanel
          status={status}
          onConnectAgain={() => setStep('preflight')}
          onRetryBilling={() => void retryMutation.mutate()}
          isRetryingBilling={retryMutation.isPending}
        />
      )}
    </WhatsAppConnectLayout>
  );
}
