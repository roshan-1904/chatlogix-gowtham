import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Modal } from '@chatlogix/ui';
import { formatWalletAmount } from '../../lib/money';
import {
  getVendorConfig,
  getVendorWalletTransactions,
  rechargeVendorWallet,
  type AdminVendorListRow,
  type AdminWalletTransaction,
} from '../../lib/vendors';
import { MarkupEditor } from './MarkupEditor';
import { TurnAuditToggle } from './TurnAuditToggle';
import { SettlementControls } from './SettlementControls';
import { VendorPlatformFeeInvoices } from './VendorPlatformFeeInvoices';
import { WhatsAppCard } from './WhatsAppCard';

interface VendorDetailPanelProps {
  vendor: AdminVendorListRow;
}

function transactionLabel(tx: AdminWalletTransaction): string {
  const source = tx.metadata?.source;
  if (typeof source === 'string' && source.trim()) {
    return source.replace(/_/g, ' ');
  }
  if (tx.transactionType === 'recharge') return 'money added';
  if (tx.transactionType === 'refund') return 'refund';
  return 'usage';
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'admin_recharge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

export function parseRupeesToMilli(
  input: string
): { success: true; amountMilli: number; rupees: number } | { success: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: false, error: 'Recharge amount is required' };
  }
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return { success: false, error: 'Enter a valid positive rupee amount (e.g. 50.00)' };
  }
  const roundedMilli = Math.round(rupees * 1000);
  if (Math.abs(rupees * 1000 - roundedMilli) > 1e-6) {
    return {
      success: false,
      error: 'Amount cannot specify fractions smaller than 1 millirupee (0.001 ₹)',
    };
  }
  if (roundedMilli <= 0 || !Number.isInteger(roundedMilli)) {
    return { success: false, error: 'Amount must convert to a positive integer in millirupees' };
  }
  return { success: true, amountMilli: roundedMilli, rupees };
}

export function validateRechargeReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) {
    return 'Recharge reason is required';
  }
  if (trimmed.length < 3) {
    return 'Reason must be at least 3 characters';
  }
  if (trimmed.length > 200) {
    return 'Reason cannot exceed 200 characters';
  }
  return null;
}

interface RechargeWalletCardProps {
  vendorId: string;
  businessName: string;
}

export function RechargeWalletCard({ vendorId, businessName }: RechargeWalletCardProps) {
  const queryClient = useQueryClient();
  const [amountRupees, setAmountRupees] = useState('');
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateIdempotencyKey());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // When vendor changes, reset draft state
  useEffect(() => {
    setAmountRupees('');
    setReason('');
    setValidationError(null);
    setSuccessFeedback(null);
    setApiError(null);
    setIsConfirmOpen(false);
    setIdempotencyKey(generateIdempotencyKey());
  }, [vendorId]);

  const parsedAmount = parseRupeesToMilli(amountRupees);
  const isFormValid = parsedAmount.success && !validateRechargeReason(reason);

  const rechargeMutation = useMutation({
    mutationFn: async ({
      amountMilli,
      reasonTrimmed,
      key,
    }: {
      amountMilli: number;
      reasonTrimmed: string;
      key: string;
    }) => {
      return rechargeVendorWallet(vendorId, {
        amount: amountMilli,
        reason: reasonTrimmed,
        idempotencyKey: key,
      });
    },
    onSuccess: (data, variables) => {
      setIsConfirmOpen(false);
      const creditedRupees = (variables.amountMilli / 1000).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      setSuccessFeedback(
        `Successfully credited ₹${creditedRupees} to ${businessName}. New balance: ${formatWalletAmount(data.walletBalanceMilli)}.`
      );
      setAmountRupees('');
      setReason('');
      setValidationError(null);
      setApiError(null);
      setIdempotencyKey(generateIdempotencyKey());

      void queryClient.invalidateQueries({ queryKey: ['admin-vendor', vendorId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-vendor', vendorId, 'wallet-transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Wallet recharge failed. Please retry.';
      setApiError(message);
    },
  });

  const handleOpenConfirm = () => {
    setSuccessFeedback(null);
    setApiError(null);

    const amountCheck = parseRupeesToMilli(amountRupees);
    if (!amountCheck.success) {
      setValidationError(amountCheck.error);
      return;
    }

    const reasonCheck = validateRechargeReason(reason);
    if (reasonCheck) {
      setValidationError(reasonCheck);
      return;
    }

    setValidationError(null);
    setIsConfirmOpen(true);
  };

  return (
    <div id="wallet">
      <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[#072349]">Recharge AI wallet</h3>
        <Badge variant="info">Manual Credit</Badge>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Credit AI usage money to this shop (₹50.00 = 50,000 milli). A valid reason is required for audit.
      </p>

      {successFeedback && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          {successFeedback}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleOpenConfirm();
        }}
        className="mt-4 space-y-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="recharge-amount" className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Amount (₹)
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                ₹
              </span>
              <input
                id="recharge-amount"
                type="text"
                inputMode="decimal"
                placeholder="50.00"
                value={amountRupees}
                onChange={(e) => {
                  setAmountRupees(e.target.value);
                  setValidationError(null);
                  setSuccessFeedback(null);
                }}
                disabled={rechargeMutation.isPending}
                className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:bg-gray-100"
              />
            </div>
            <p className="mt-0.5 text-[11px] text-gray-400">Enter rupees (e.g. 50.00)</p>
          </div>

          <div>
            <label htmlFor="recharge-reason" className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Reason ({reason.trim().length}/200)
            </label>
            <input
              id="recharge-reason"
              type="text"
              placeholder="e.g. Goodwill credit after outage"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setValidationError(null);
                setSuccessFeedback(null);
              }}
              disabled={rechargeMutation.isPending}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:bg-gray-100"
            />
            <p className="mt-0.5 text-[11px] text-gray-400">Required: 3–200 characters</p>
          </div>
        </div>

        {validationError && (
          <p className="text-xs text-red-600">{validationError}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-gray-400">
            Idempotency: <code className="font-mono text-[10px] text-gray-500">{idempotencyKey.slice(0, 8)}…</code>
          </span>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={rechargeMutation.isPending || !isFormValid}
          >
            Review &amp; Credit
          </Button>
        </div>
      </form>

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!rechargeMutation.isPending) {
            setIsConfirmOpen(false);
          }
        }}
        title="Confirm AI wallet recharge"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Please review the recharge details before applying credit:
          </p>

          <dl className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Shop:</dt>
              <dd className="font-medium text-[#072349]">{businessName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Amount to Credit:</dt>
              <dd className="font-bold text-[#1a9e4b]">
                {parsedAmount.success ? (
                  <>
                    ₹{parsedAmount.rupees.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-gray-400">
                      ({parsedAmount.amountMilli.toLocaleString('en-IN')} milli)
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Reason:</dt>
              <dd className="max-w-[220px] text-right font-medium text-gray-700 truncate">{reason.trim()}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-200/60 pt-2 text-xs">
              <dt className="text-gray-400">Idempotency key:</dt>
              <dd className="font-mono text-[10px] text-gray-500 truncate max-w-[200px]">{idempotencyKey}</dd>
            </div>
          </dl>

          {apiError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <p className="font-semibold">Recharge failed</p>
              <p className="mt-0.5">{apiError}</p>
              <p className="mt-1 text-[11px] text-red-600">
                You can safely retry. The same idempotency key will be reused to prevent double credits.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Wallet credits cannot be reversed automatically. Ensure the amount and reason are correct.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirmOpen(false)}
              disabled={rechargeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={rechargeMutation.isPending}
              onClick={() => {
                if (parsedAmount.success) {
                  rechargeMutation.mutate({
                    amountMilli: parsedAmount.amountMilli,
                    reasonTrimmed: reason.trim(),
                    key: idempotencyKey,
                  });
                }
              }}
            >
              {apiError ? 'Retry recharge' : 'Confirm & Credit'}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
    </div>
  );
}

export function VendorDetailPanel({ vendor }: VendorDetailPanelProps) {
  const configQuery = useQuery({
    queryKey: ['admin-vendor', vendor.id],
    queryFn: () => getVendorConfig(vendor.id),
  });

  const transactionsQuery = useQuery({
    queryKey: ['admin-vendor', vendor.id, 'wallet-transactions'],
    queryFn: () => getVendorWalletTransactions(vendor.id, 50),
  });

  const balanceMilli = configQuery.data?.walletBalanceMilli ?? vendor.walletBalanceMilli;
  const markupPercent = configQuery.data?.markupPercent ?? vendor.markupPercent;
  const paymentFeeBps = configQuery.data?.paymentFeeBps ?? 100;
  const paymentsManaged = configQuery.data?.paymentsManagedByChatlogix ?? false;
  const paymentLinkAutoSend = configQuery.data?.paymentLinkAutoSend ?? false;
  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-[#072349]">{vendor.businessName}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {vendor.phone || 'No phone'}
              {vendor.email ? ` · ${vendor.email}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/vendors/${vendor.id}/shop`}>
              <Button variant="ghost" size="sm" className="border border-gray-300 text-xs font-semibold">
                View catalog and orders &rarr;
              </Button>
            </Link>
            <Badge variant={vendor.subscriptionStatus === 'active' ? 'success' : 'default'}>
              {vendor.subscriptionStatus || 'unknown'}
            </Badge>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              AI wallet
            </dt>
            <dd className="mt-1 text-2xl font-bold text-[#072349]">{formatWalletAmount(balanceMilli)}</dd>
            <dd className="mt-0.5 text-xs text-gray-500">Message &amp; AI usage</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Markup</dt>
            <dd className="mt-1 text-2xl font-bold text-[#072349]">{markupPercent}%</dd>
            <dd className="mt-0.5 text-xs text-gray-500">On usage charges</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Order payments</dt>
            <dd className="mt-1">
              <Badge variant={paymentsManaged ? 'success' : 'default'}>
                {paymentsManaged ? 'Route active' : 'Not collecting'}
              </Badge>
            </dd>
            {paymentsManaged && (
              <dd className="mt-1 text-xs text-gray-500">
                Auto payment links {paymentLinkAutoSend ? 'on' : 'off'}
              </dd>
            )}
          </div>
        </dl>
      </Card>

      <WhatsAppCard vendorId={vendor.id} businessName={vendor.businessName} />

      <RechargeWalletCard vendorId={vendor.id} businessName={vendor.businessName} />

      <Card className="p-5">
        <MarkupEditor vendorId={vendor.id} markupPercent={markupPercent} paymentFeeBps={paymentFeeBps} />
      </Card>

      <Card className="p-5">
        <TurnAuditToggle vendorId={vendor.id} />
      </Card>

      <Card className="p-5">
        <SettlementControls vendorId={vendor.id} />
      </Card>

      <Card className="p-5">
        <VendorPlatformFeeInvoices vendorId={vendor.id} />
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold text-[#072349]">Recent wallet activity</h3>
        {transactionsQuery.isLoading && <p className="mt-3 text-sm text-gray-500">Loading activity…</p>}
        {transactionsQuery.isError && (
          <p className="mt-3 text-sm text-red-600">Could not load wallet activity.</p>
        )}
        {!transactionsQuery.isLoading && !transactionsQuery.isError && transactions.length === 0 && (
          <p className="mt-3 text-sm text-gray-500">Nothing here yet.</p>
        )}
        {transactions.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium capitalize text-gray-800">{transactionLabel(tx)}</span>
                  {typeof tx.metadata?.reason === 'string' && tx.metadata.reason.trim().length > 0 && (
                    <p className="text-xs text-gray-600 truncate max-w-sm">
                      Reason: {tx.metadata.reason.trim()}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    {new Date(tx.transactionDate).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={
                      tx.transactionType === 'deduction' ? 'text-red-600' : 'text-[#1a9e4b]'
                    }
                  >
                    {tx.transactionType === 'deduction' ? '−' : '+'}
                    {formatWalletAmount(tx.amountMilli)}
                  </span>
                  <p className="text-xs text-gray-400">
                    Balance {formatWalletAmount(tx.balanceAfterMilli)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
