import { Card } from '@chatlogix/ui';
import { useNavigate } from 'react-router-dom';
import { formatWalletAmount } from '../../utils/currency';

interface WalletBalanceCardProps {
  balanceMilli: number;
  spentThisMonthMilli: number;
  lowBalanceWarning: boolean;
  billingCycleEnd?: string;
}

export function WalletBalanceCard({
  balanceMilli,
  spentThisMonthMilli,
  lowBalanceWarning,
  billingCycleEnd
}: WalletBalanceCardProps) {
  const navigate = useNavigate();
  const balanceLabel = formatWalletAmount(balanceMilli);
  const cycleLabel = billingCycleEnd
    ? `This month, to ${new Date(billingCycleEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
    : 'This month';

  return (
    <Card className="p-3 sm:p-4 lg:p-5 bg-gradient-to-br from-white to-[#25D366]/5 border-[#25D366]/10 flex flex-col min-h-[120px] sm:min-h-[140px]">
      <h3 className="text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 sm:mb-3">
        Wallet balance
      </h3>
      <p
        className="text-2xl sm:text-3xl font-bold text-[#072349] mb-2 leading-tight"
        aria-label={`Wallet balance is ${balanceLabel}`}
      >
        {balanceLabel}
      </p>

      <div className="flex-1 flex flex-col justify-end gap-2">
        <div className="space-y-0.5">
          <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed">
            Spent {formatWalletAmount(spentThisMonthMilli)}
          </p>
          <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed">{cycleLabel}</p>
        </div>

        {lowBalanceWarning && (
          <p className="text-[10px] sm:text-xs font-medium text-yellow-700" role="status">
            Running low. Add money so replies keep going out.
          </p>
        )}

        <button
          type="button"
          onClick={() => void navigate('/wallet')}
          className={`w-full rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            lowBalanceWarning
              ? 'bg-[#25D366] text-white hover:bg-[#25D366]/90'
              : 'border border-[#072349]/15 text-[#072349] hover:bg-[#072349]/5'
          }`}
        >
          Add money
        </button>
      </div>
    </Card>
  );
}
