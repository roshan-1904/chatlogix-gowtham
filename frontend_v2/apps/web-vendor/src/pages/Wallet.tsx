import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button, Card } from '@chatlogix/ui';
import {
  confirmMockTopUp,
  createTopUpIntent,
  disableAutoRecharge,
  getWallet,
  milliToPaise,
  setupAutoRecharge
} from '../lib/wallet';
import { openRazorpayCheckout, openRazorpayMandateCheckout } from '../lib/razorpayCheckout';
import { formatWalletAmount, rupeesToMilli } from '../utils/currency';
import { Link } from 'react-router-dom';
import { useAuth } from '@chatlogix/auth';

const DEFAULT_PRESETS_MILLI = [500_000, 1_000_000, 2_000_000, 5_000_000];
const WALLET_POLL_INTERVAL_MS = 2000;
const WALLET_POLL_MAX_ATTEMPTS = 20;

function parseRupees(rupees: string): number | null {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n <= 0) return null;
  return rupeesToMilli(n);
}

function transactionLabel(transactionType: string, metadata?: Record<string, unknown>): string {
  const source = metadata?.source;
  if (typeof source === 'string' && source.trim()) {
    return source.replace(/_/g, ' ');
  }
  if (transactionType === 'recharge') return 'Money added';
  if (transactionType === 'refund') return 'Refund';
  return 'Usage';
}

async function pollWalletBalanceAfterTopUp(previousBalanceMilli: number): Promise<number> {
  for (let attempt = 0; attempt < WALLET_POLL_MAX_ATTEMPTS; attempt += 1) {
    await new Promise((r) => setTimeout(r, WALLET_POLL_INTERVAL_MS));
    const wallet = await getWallet();
    if (wallet.balanceMilli > previousBalanceMilli) {
      return wallet.balanceMilli;
    }
  }
  throw new Error('Payment received — balance may take a moment to update. Refresh the page shortly.');
}

export function Wallet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customRupees, setCustomRupees] = useState('');
  const [autoRechargePreset, setAutoRechargePreset] = useState<number | null>(null);

  const walletQuery = useQuery({
    queryKey: ['vendor-wallet', user?.vendorId],
    queryFn: getWallet,
    enabled: !!user?.vendorId
  });

  const presets = walletQuery.data?.presetsMilli ?? DEFAULT_PRESETS_MILLI;
  const amountMilli = useMemo(() => {
    if (selectedPreset !== null) return selectedPreset;
    return parseRupees(customRupees);
  }, [selectedPreset, customRupees]);

  const autoRechargeMutation = useMutation({
    mutationFn: async (amountMilli: number) => {
      const setup = await setupAutoRecharge(amountMilli);
      if (!setup.clientAction || setup.clientAction.type !== 'razorpay_mandate_checkout') {
        throw new Error('Auto-recharge setup is unavailable');
      }
      await openRazorpayMandateCheckout({
        keyId: setup.clientAction.keyId,
        orderId: setup.clientAction.orderId,
        customerId: setup.clientAction.customerId,
        amountPaise: milliToPaise(setup.clientAction.amountMilli),
        description: `UPI auto-recharge ${formatWalletAmount(setup.clientAction.amountMilli)} when balance is under ₹100`
      });
    },
    onSuccess: () => {
      toast.success('Mandate submitted — auto-recharge turns on after your bank confirms.');
      void queryClient.invalidateQueries({ queryKey: ['vendor-wallet'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Auto-recharge setup failed');
    }
  });

  const disableAutoRechargeMutation = useMutation({
    mutationFn: disableAutoRecharge,
    onSuccess: () => {
      toast.success('Auto-recharge turned off');
      void queryClient.invalidateQueries({ queryKey: ['vendor-wallet'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Could not turn off auto-recharge');
    }
  });

  const topUpMutation = useMutation({
    mutationFn: async () => {
      if (amountMilli === null) {
        throw new Error('Enter a valid amount');
      }
      const before = walletQuery.data?.balanceMilli ?? 0;
      const intent = await createTopUpIntent(amountMilli);

      if (intent.provider === 'mock') {
        if (intent.clientAction.type !== 'mock_confirm') {
          throw new Error('Unexpected mock top-up action');
        }
        const result = await confirmMockTopUp(intent.clientAction.intentId);
        return result.balanceMilli;
      }

      if (intent.clientAction.type !== 'razorpay_checkout') {
        throw new Error('Unexpected payment action');
      }

      await openRazorpayCheckout({
        keyId: intent.clientAction.keyId,
        orderId: intent.clientAction.orderId,
        amountPaise: milliToPaise(intent.clientAction.amountMilli),
        description: `Add ${formatWalletAmount(intent.amountMilli)} to your AI wallet`
      });

      return pollWalletBalanceAfterTopUp(before);
    },
    onSuccess: (balanceMilli) => {
      toast.success(`Wallet updated: ${formatWalletAmount(balanceMilli)}`);
      void queryClient.invalidateQueries({ queryKey: ['vendor-wallet'] });
      if (user?.vendorId) {
        void queryClient.invalidateQueries({ queryKey: ['vendor', user.vendorId, 'config'] });
      }
      setCustomRupees('');
      setSelectedPreset(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Top-up failed');
    }
  });

  const summary = walletQuery.data;
  const isMock = summary?.provider === 'mock';
  const isRazorpay = summary?.provider === 'razorpay';
  const mockTopUpOff = isMock && !summary?.mockTopUpEnabled;
  const autoRecharge = summary?.autoRecharge;
  const autoRechargePresets = autoRecharge?.presetAmountsMilli ?? [500_000, 1_000_000, 2_000_000];
  const selectedAutoMilli =
    autoRechargePreset ?? autoRecharge?.amountMilli ?? autoRechargePresets[0] ?? 500_000;

  if (walletQuery.isLoading) {
    return <p className="text-sm text-gray-600 p-2">Loading wallet…</p>;
  }

  if (walletQuery.error || !summary) {
    return (
      <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
        Could not load wallet. Try again later.
      </div>
    );
  }

  const payButtonLabel = topUpMutation.isPending
    ? 'Processing…'
    : isMock
      ? 'Add money (simulated)'
      : 'Pay with Razorpay';

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Wallet</h1>
        <p className="text-sm text-gray-600 mt-1">
          Add money to your wallet. Each customer message the assistant handles is charged in rupees from this
          balance. Customer order payments (Route settlement) are tracked separately under{' '}
          <Link to="/order-payments" className="font-medium text-primary-500 underline-offset-2 hover:underline">
            Order payments
          </Link>
          .
        </p>
      </header>

      {isMock && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Payments are simulated until Razorpay is connected.{' '}
          {mockTopUpOff
            ? 'Simulated payments are turned off here, so you cannot add money yet.'
            : 'Use “Add money (simulated)” to top up your balance in this environment.'}
        </div>
      )}

      {isRazorpay && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Pay securely with Razorpay. Your wallet balance updates after payment is confirmed — you can close the
          checkout window once payment succeeds.
        </div>
      )}

      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current balance</p>
        <p className="text-3xl font-bold text-[#072349] mt-1">{formatWalletAmount(summary.balanceMilli)}</p>
      </Card>

      {isRazorpay && autoRecharge && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#072349]">Auto-recharge</h2>
              <p className="text-sm text-gray-600 mt-1">
                When your balance drops below ₹100, we can refill it via UPI Autopay after a 25-hour notice
                (mandate required).
              </p>
            </div>
            {autoRecharge.enabled && autoRecharge.hasMandate && (
              <Button
                variant="secondary"
                disabled={disableAutoRechargeMutation.isPending}
                onClick={() => disableAutoRechargeMutation.mutate()}
              >
                Turn off
              </Button>
            )}
          </div>

          {autoRecharge.enabled && autoRecharge.amountMilli !== null && (
            <p className="text-sm text-gray-700">
              Active preset:{' '}
              <span className="font-semibold text-[#072349]">
                {formatWalletAmount(autoRecharge.amountMilli)}
              </span>
            </p>
          )}

          {autoRecharge.pendingRegistration && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Waiting for bank approval of your{' '}
              {formatWalletAmount(autoRecharge.pendingRegistration.amountMilli)} mandate.
            </p>
          )}

          {autoRecharge.scheduledDebit && (
            <p className="text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              Next auto-recharge debit around{' '}
              <span className="font-medium">
                {new Date(autoRecharge.scheduledDebit.scheduledDebitAt).toLocaleString()}
              </span>{' '}
              ({formatWalletAmount(autoRecharge.scheduledDebit.amountMilli)}).
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {autoRechargePresets.map((milli) => {
              const active = selectedAutoMilli === milli;
              return (
                <button
                  key={`ar-${milli}`}
                  type="button"
                  onClick={() => setAutoRechargePreset(milli)}
                  className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300'
                  }`}
                >
                  {formatWalletAmount(milli)}
                </button>
              );
            })}
          </div>

          <Button
            variant="primary"
            disabled={autoRechargeMutation.isPending}
            onClick={() => autoRechargeMutation.mutate(selectedAutoMilli)}
            className="w-full sm:w-auto"
          >
            {autoRechargeMutation.isPending
              ? 'Opening UPI mandate…'
              : autoRecharge.enabled && autoRecharge.hasMandate
                ? 'Change amount (new mandate)'
                : 'Set up UPI auto-recharge'}
          </Button>
        </Card>
      )}

      <Card className="p-5 space-y-4">
        <h2 className="text-base font-semibold text-[#072349]">Add money</h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((milli) => {
            const active = selectedPreset === milli;
            return (
              <button
                key={milli}
                type="button"
                onClick={() => {
                  setSelectedPreset(milli);
                  setCustomRupees('');
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                  active
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300'
                }`}
              >
                {formatWalletAmount(milli)}
              </button>
            );
          })}
        </div>
        <div>
          <label htmlFor="custom-amount" className="block text-sm font-medium text-gray-700 mb-1">
            Custom amount (₹)
          </label>
          <input
            id="custom-amount"
            type="number"
            min={100}
            step={1}
            value={customRupees}
            onChange={(e) => {
              setCustomRupees(e.target.value);
              setSelectedPreset(null);
            }}
            className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g. 1500"
          />
        </div>
        <Button
          variant="primary"
          disabled={topUpMutation.isPending || amountMilli === null || mockTopUpOff}
          onClick={() => topUpMutation.mutate()}
          className="w-full sm:w-auto"
        >
          {payButtonLabel}
        </Button>
        {mockTopUpOff && (
          <p className="text-sm text-gray-600">
            Simulated payments are turned off for this account, so you cannot add money right now. Ask the ChatLogix
            team to turn them on, or wait until real payments are live.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-[#072349] mb-3">Recent activity</h2>
        {summary.recentTransactions.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {summary.recentTransactions.map((tx) => (
              <li key={tx.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium capitalize text-gray-800">
                    {transactionLabel(tx.transactionType, tx.metadata)}
                  </span>
                  <span className="text-gray-400 mx-2">·</span>
                  <span className="text-gray-500">{new Date(tx.transactionDate).toLocaleString()}</span>
                </div>
                <div className="text-right">
                  <span className={tx.transactionType === 'deduction' ? 'text-red-600' : 'text-green-700'}>
                    {tx.transactionType === 'deduction' ? '−' : '+'}
                    {formatWalletAmount(tx.amountMilli)}
                  </span>
                  <p className="text-xs text-gray-400">Balance {formatWalletAmount(tx.balanceAfterMilli)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
