import { Card } from '@chatlogix/ui';
import { useNavigate } from 'react-router-dom';
import { formatWalletAmount } from '../../utils/currency';

interface WalletBalanceCardProps {
  balanceMilli: number;
  spentThisMonthMilli: number;
  lowBalanceWarning: boolean;
  billingCycleEnd?: string;
  hideAddMoney?: boolean;
}

export function WalletBalanceCard({
  balanceMilli,
  spentThisMonthMilli,
  lowBalanceWarning,
  billingCycleEnd,
  hideAddMoney = false,
}: WalletBalanceCardProps) {
  const navigate = useNavigate();
  const balanceLabel = formatWalletAmount(balanceMilli);
  const cycleLabel = billingCycleEnd
    ? `This month, to ${new Date(billingCycleEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : 'This month';

  return (
    <Card className="rounded-xl border-gray-200/80 p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Wallet</p>
      <p className="mt-1 text-2xl font-bold text-primary-500" aria-label={`Wallet balance is ${balanceLabel}`}>
        {balanceLabel}
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Spent {formatWalletAmount(spentThisMonthMilli)} · {cycleLabel}
      </p>
      {lowBalanceWarning && (
        <p className="mt-2 text-xs font-medium text-amber-700" role="status">
          Balance is low — replies may stop when it runs out.
        </p>
      )}
      {!hideAddMoney && (
        <button
          type="button"
          onClick={() => void navigate('/wallet')}
          className={`mt-3 w-full rounded-lg py-2 text-xs font-semibold transition-colors ${
            lowBalanceWarning
              ? 'bg-secondary-500 text-white hover:bg-secondary-500/90'
              : 'border border-primary-500/15 text-primary-500 hover:bg-primary-500/5'
          }`}
        >
          Add money
        </button>
      )}
    </Card>
  );
}
