import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button, Card } from '@chatlogix/ui';
import { confirmMockTopUp, createTopUpIntent, getWallet } from '../lib/wallet';
import { formatWalletAmount, rupeesToMilli } from '../utils/currency';
import { useAuth } from '@chatlogix/auth';

const DEFAULT_PRESETS_MILLI = [500_000, 1_000_000, 2_000_000, 5_000_000];

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

export function Wallet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customRupees, setCustomRupees] = useState('');

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

  const topUpMutation = useMutation({
    mutationFn: async () => {
      if (amountMilli === null) {
        throw new Error('Enter a valid amount');
      }
      const intent = await createTopUpIntent(amountMilli);
      if (intent.provider !== 'mock' || intent.clientAction.type !== 'mock_confirm') {
        throw new Error('Only mock top-up is available in this build');
      }
      return confirmMockTopUp(intent.clientAction.intentId);
    },
    onSuccess: (result) => {
      toast.success(`Wallet updated: ${formatWalletAmount(result.balanceMilli)}`);
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
  const mockTopUpOff = isMock && !summary?.mockTopUpEnabled;

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

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Wallet</h1>
        <p className="text-sm text-gray-600 mt-1">
          Add money to your wallet. Each customer message the assistant handles is charged in rupees from this
          balance.
        </p>
      </header>

      {isMock && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Payments are simulated until Razorpay is connected.{' '}
          {mockTopUpOff
            ? 'Simulated payments are turned off here, so you cannot add money yet.'
            : 'Use \u201CAdd money (simulated)\u201D to top up your balance in this environment.'}
        </div>
      )}

      <Card className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current balance</p>
        <p className="text-3xl font-bold text-[#072349] mt-1">{formatWalletAmount(summary.balanceMilli)}</p>
      </Card>

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
          {topUpMutation.isPending ? 'Processing…' : 'Add money (simulated)'}
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
