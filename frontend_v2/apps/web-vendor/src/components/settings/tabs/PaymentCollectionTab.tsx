import { useEffect, useState } from 'react';
import { Button } from '@chatlogix/ui';
import { apiClient } from '../../../lib/api';
import { confirmBankChange, requestBankChangeOtp } from '../../../lib/settlement';

interface CollectionStatus {
  paymentsManagedByChatlogix: boolean;
  paymentLinkAutoSend: boolean;
  linkedAccountStatus: string | null;
  razorpayLinkedAccountId: string | null;
  collectionStartedAt: string | null;
  settlementBankAccountMasked: string | null;
  settlementBankIfsc: string | null;
  legalName: string | null;
}

interface PaymentCollectionTabProps {
  vendorId: string;
}

export function PaymentCollectionTab({ vendorId }: PaymentCollectionTabProps) {
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankSession, setBankSession] = useState<string | null>(null);
  const [bankOtp, setBankOtp] = useState('');
  const [bankForm, setBankForm] = useState({
    bankAccountNumber: '',
    bankIfsc: '',
    bankAccountHolderName: ''
  });
  const [bankBusy, setBankBusy] = useState(false);
  const [form, setForm] = useState({
    legalName: '',
    businessType: 'proprietorship',
    pan: '',
    gstin: '',
    gstExempt: false,
    bankAccountNumber: '',
    bankIfsc: '',
    bankAccountHolderName: '',
    contactEmail: '',
    contactPhone: ''
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<CollectionStatus>(`/vendors/${vendorId}/payments/collection`);
      setStatus(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load payment settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [vendorId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/vendors/${vendorId}/payments/linked-account`, form);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Opt-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAutoSend = async () => {
    if (!status) return;
    const next = !status.paymentLinkAutoSend;
    await apiClient.patch(`/vendors/${vendorId}/payments/settings`, {
      paymentLinkAutoSend: next
    });
    setStatus({ ...status, paymentLinkAutoSend: next });
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading payment collection…</p>;
  }

  if (status?.paymentsManagedByChatlogix) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="font-medium text-green-900">ChatLogix payment collection is active</p>
          <p className="text-sm text-green-800 mt-1">
            Linked account: {status.razorpayLinkedAccountId} ({status.linkedAccountStatus})
          </p>
          {status.settlementBankAccountMasked && (
            <p className="text-sm text-green-800">
              Settlement account: {status.settlementBankAccountMasked} · {status.settlementBankIfsc}
            </p>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={status.paymentLinkAutoSend}
            onChange={() => void toggleAutoSend()}
            className="rounded border-gray-300"
          />
          Automatically send payment links in WhatsApp when customers confirm orders
        </label>
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-900">Change settlement bank account</p>
          <p className="text-xs text-gray-600">
            Requires a phone OTP on your registered number. Releases pause for 48 hours after a change.
          </p>
          {!bankSession ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={bankBusy}
              onClick={async () => {
                setBankBusy(true);
                try {
                  const { sessionInfo } = await requestBankChangeOtp(vendorId);
                  setBankSession(sessionInfo);
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : 'Could not send OTP');
                } finally {
                  setBankBusy(false);
                }
              }}
            >
              Send verification code
            </Button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  ['bankAccountHolderName', 'Account holder name'],
                  ['bankAccountNumber', 'Account number'],
                  ['bankIfsc', 'IFSC']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-sm block">
                  <span className="text-gray-700">{label}</span>
                  <input
                    className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5"
                    value={bankForm[key]}
                    onChange={(e) => setBankForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="text-sm block sm:col-span-2">
                <span className="text-gray-700">Verification code</span>
                <input
                  className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5"
                  value={bankOtp}
                  onChange={(e) => setBankOtp(e.target.value)}
                />
              </label>
              <Button
                type="button"
                size="sm"
                isLoading={bankBusy}
                onClick={async () => {
                  setBankBusy(true);
                  setError(null);
                  try {
                    await confirmBankChange(vendorId, {
                      ...bankForm,
                      sessionInfo: bankSession,
                      otp: bankOtp
                    });
                    setBankSession(null);
                    setBankOtp('');
                    await load();
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : 'Bank change failed');
                  } finally {
                    setBankBusy(false);
                  }
                }}
              >
                Confirm bank change
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status?.razorpayLinkedAccountId && status.linkedAccountStatus !== 'activated') {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
        <p className="font-medium text-amber-900">Linked account pending activation</p>
        <p className="text-sm text-amber-800 mt-1">
          Status: {status.linkedAccountStatus}. Collection turns on when Razorpay activates the account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <p className="text-sm text-gray-600">
        Opt in to let ChatLogix collect order payments via Razorpay Route. PAN is stored encrypted; only a masked bank
        account is shown after submit.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(
          [
            ['legalName', 'Legal business name'],
            ['businessType', 'Business type'],
            ['pan', 'PAN'],
            ['gstin', 'GSTIN (optional if exempt)'],
            ['bankAccountHolderName', 'Account holder name'],
            ['bankAccountNumber', 'Bank account number'],
            ['bankIfsc', 'IFSC'],
            ['contactEmail', 'Contact email'],
            ['contactPhone', 'Contact phone']
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-gray-700">{label}</span>
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              required={key !== 'gstin'}
            />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.gstExempt}
          onChange={(e) => setForm((f) => ({ ...f, gstExempt: e.target.checked }))}
        />
        GST exempt (no GSTIN)
      </label>
      <Button type="submit" variant="primary" isLoading={submitting}>
        Submit for Route onboarding
      </Button>
    </form>
  );
}
