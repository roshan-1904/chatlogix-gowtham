import { formatRupee } from '../../lib/onboarding';

interface TrialWalletBarProps {
  balancePaise: number;
  grantedPaise: number;
  expiresAt: string | null;
  loading?: boolean;
  variant?: 'default' | 'compact';
}

export function TrialWalletBar({
  balancePaise,
  grantedPaise,
  expiresAt,
  loading,
  variant = 'default',
}: TrialWalletBarProps) {
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  if (variant === 'compact') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-primary-100 bg-primary-50/80 px-3 py-2 text-xs">
        <p className="font-medium text-primary-800">
          {loading ? 'Trial…' : `${formatRupee(balancePaise)} of ${formatRupee(grantedPaise)} trial`}
        </p>
        {expiresLabel && <p className="text-gray-600">Expires {expiresLabel}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50/80 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">Trial balance</p>
          <p className="text-primary-700">
            {loading ? '…' : `${formatRupee(balancePaise)} of ${formatRupee(grantedPaise)}`}
          </p>
        </div>
        {expiresLabel && <p className="text-xs text-gray-600">Expires {expiresLabel}</p>}
      </div>
      {balancePaise <= 2000 && balancePaise > 0 && (
        <p className="mt-2 text-xs text-amber-800">Your trial balance is running low.</p>
      )}
      {balancePaise <= 0 && (
        <p className="mt-2 text-xs text-gray-700">Trial balance used — you can still submit for approval.</p>
      )}
    </div>
  );
}
