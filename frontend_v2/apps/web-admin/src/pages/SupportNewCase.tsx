import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, Button, Input } from '@chatlogix/ui';
import { createCase } from '../lib/support';
import { listVendors, type AdminVendorListRow } from '../lib/vendors';

export function SupportNewCase() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const prefillVendorId = searchParams.get('vendorId') || '';
  const prefillConversationId = searchParams.get('conversationId') || '';

  const [selectedVendorId, setSelectedVendorId] = useState(prefillVendorId);
  const [subject, setSubject] = useState('');
  const [conversationId, setConversationId] = useState(prefillConversationId);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: vendors, isLoading: vendorsLoading } = useQuery<AdminVendorListRow[]>({
    queryKey: ['vendors-select-list'],
    queryFn: listVendors,
  });

  useEffect(() => {
    if (prefillVendorId) {
      setSelectedVendorId(prefillVendorId);
    }
    if (prefillConversationId) {
      setConversationId(prefillConversationId);
    }
  }, [prefillVendorId, prefillConversationId]);

  const lockedVendor = vendors?.find((v) => v.id === prefillVendorId);

  const createMutation = useMutation({
    mutationFn: () =>
      createCase({
        vendorId: selectedVendorId,
        subject: subject.trim(),
        conversationId: conversationId.trim() || undefined,
      }),
    onSuccess: (newCase) => {
      navigate(`/support/${newCase.id}`);
    },
    onError: (err: any) => {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to create support case.';
      setFormError(message);
    },
  });

  const isSubjectValid = subject.trim().length >= 3 && subject.trim().length <= 140;
  const isFormValid = Boolean(selectedVendorId) && isSubjectValid && !createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!isFormValid) return;
    createMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Breadcrumb Header */}
      <div>
        <Link
          to="/support"
          className="text-xs font-semibold text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 mb-2"
        >
          &larr; Back to Cases
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Open Support Case</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Create a staff-tracked incident or investigation for a vendor.
        </p>
      </div>

      {formError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-3">
          <span className="text-lg">❌</span>
          <div className="flex-1">
            <h4 className="font-semibold text-red-900">Creation Failed</h4>
            <p className="text-xs text-red-700 mt-0.5">{formError}</p>
          </div>
        </div>
      )}

      <Card className="p-6 border border-gray-200/80 shadow-sm bg-white">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Shop Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Shop (Vendor) <span className="text-red-500">*</span>
            </label>

            {prefillVendorId ? (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-gray-900">
                    {lockedVendor?.businessName || prefillVendorId}
                  </span>
                  <span className="text-xs font-mono text-gray-400 block">
                    ID: {prefillVendorId}
                  </span>
                </div>
                <span className="text-xs font-medium bg-primary-50 text-primary-700 px-2.5 py-1 rounded-md border border-primary-200">
                  Locked from Link
                </span>
              </div>
            ) : (
              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                disabled={vendorsLoading}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              >
                <option value="">-- Select a vendor --</option>
                {vendors?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.businessName} ({v.phone || 'No phone'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Subject Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Subject <span className="text-red-500">*</span>
              </label>
              <span
                className={`text-xs ${
                  subject.length > 140
                    ? 'text-red-600 font-bold'
                    : subject.length < 3
                    ? 'text-gray-400'
                    : 'text-gray-500'
                }`}
              >
                {subject.length} / 140 characters
              </span>
            </div>
            <Input
              type="text"
              placeholder="e.g. Graph 500 on outbound replies or Wallet empty block"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-sm"
              required
            />
            {subject.length > 0 && subject.length < 3 && (
              <p className="text-xs text-amber-600 mt-1">Subject must be at least 3 characters.</p>
            )}
          </div>

          {/* Optional Chat ID */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
              Conversation ID <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <Input
              type="text"
              placeholder="UUID of associated customer conversation"
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
              className="text-sm font-mono text-xs"
            />
            <p className="text-xs text-gray-400 mt-1">
              Links case directly to customer WhatsApp transcript with audited read access.
            </p>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate('/support')}
              className="border border-gray-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!isFormValid}
              isLoading={createMutation.isPending}
              className="shadow-sm"
            >
              Create Support Case
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
