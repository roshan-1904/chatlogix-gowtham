import { useState } from 'react';
import { Card } from '@chatlogix/ui';
import { formatAmountWithSymbol } from '../../utils/currency';

interface CreditsCardProps {
  planCredits: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  walletBalance: number; // in paise
  planName: string;
  lowBalanceWarning: boolean;
  billingCycleEnd?: string;
}

export function CreditsCard({
  planCredits,
  usedThisMonth,
  remainingThisMonth,
  walletBalance,
  planName,
  lowBalanceWarning,
  billingCycleEnd
}: CreditsCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const usagePercentage = planCredits > 0 ? (usedThisMonth / planCredits) * 100 : 0;
  const progressColor = usagePercentage < 50 
    ? 'bg-green-500' 
    : usagePercentage < 80 
      ? 'bg-yellow-500' 
      : 'bg-red-500';

  return (
    <Card className="p-5 bg-gradient-to-br from-white to-[#25D366]/5 border-[#25D366]/10 h-full flex flex-col">
      <div className="flex flex-col h-full">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Credits</h3>
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-3xl font-bold text-[#072349] leading-tight" aria-label={`${remainingThisMonth} credits remaining out of ${planCredits}`}>{remainingThisMonth}</span>
          <span className="text-xs text-gray-500 font-medium" aria-hidden="true">of {planCredits}</span>
        </div>
        <div className="flex-1 flex flex-col justify-end">
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3 shadow-inner" role="progressbar" aria-valuenow={usagePercentage} aria-valuemin={0} aria-valuemax={100} aria-label={`Credit usage: ${usagePercentage.toFixed(1)}%`}>
            <div
              className={`h-2.5 rounded-full transition-all shadow-sm ${progressColor}`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            />
          </div>
          <div className="space-y-1 mb-2">
            <p className="text-xs text-gray-500 leading-relaxed">
              {usedThisMonth} used ({usagePercentage.toFixed(1)}%)
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              <span className="font-semibold text-[#072349]">{planName} Plan</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Wallet: <span className="font-semibold text-[#072349]">{formatAmountWithSymbol(walletBalance)}</span>
            </p>
            <span className="text-gray-300">•</span>
            <p className="text-xs text-gray-500">
              Resets {billingCycleEnd ? new Date(billingCycleEnd).toLocaleDateString() : 'monthly'}
            </p>
            {lowBalanceWarning && (
              <div className="relative inline-block ml-auto">
                <button
                  type="button"
                  className="text-yellow-600 hover:text-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-1 rounded-full transition-colors"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  aria-label="Low wallet balance warning"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {showTooltip && (
                  <div
                    className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none"
                    role="tooltip"
                  >
                    Low wallet balance: Recharge now to avoid service interruption for extra usage
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                      <div className="border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

