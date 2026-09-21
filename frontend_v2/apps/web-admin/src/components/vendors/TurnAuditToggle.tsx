import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getVendorFeatureFlags, patchVendorFeatureFlags } from '../../lib/vendors';

interface TurnAuditToggleProps {
  vendorId: string;
}

export function TurnAuditToggle({ vendorId }: TurnAuditToggleProps) {
  const queryClient = useQueryClient();
  const flagsQuery = useQuery({
    queryKey: ['admin-vendor', vendorId, 'feature-flags'],
    queryFn: () => getVendorFeatureFlags(vendorId),
  });

  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (flagsQuery.data) {
      setEnabled(flagsQuery.data.conversation_turn_audit);
    }
  }, [vendorId, flagsQuery.data]);

  const save = useMutation({
    mutationFn: (next: boolean) => patchVendorFeatureFlags(vendorId, { conversation_turn_audit: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-vendor', vendorId, 'feature-flags'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-vendor', vendorId] });
    },
  });

  const serverValue = flagsQuery.data?.conversation_turn_audit ?? false;
  const isDirty = enabled !== serverValue;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-[#072349]">Turn audit logging</h3>
        <p className="mt-1 text-xs text-gray-500">
          Temporary debugging only. Events go to the dedicated log group (e.g. /chatlogix/turn-audit), not
          Lambda default logs. Includes customer PII. Effective on Lambdas within ~30s after save.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-[#072349] focus:ring-primary-500"
          checked={enabled}
          disabled={flagsQuery.isLoading || save.isPending}
          onChange={(e) => {
            setEnabled(e.target.checked);
            save.reset();
          }}
        />
        <span className="text-sm text-gray-800">Enable verbose turn audit for this vendor</span>
      </label>

      {isDirty && (
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate(enabled)}
          className="rounded-lg bg-[#072349] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      )}

      {save.isError && (
        <p className="text-xs text-red-600">
          {save.error instanceof Error ? save.error.message : 'Could not update turn audit setting.'}
        </p>
      )}
      {save.isSuccess && !isDirty && (
        <p className="text-xs font-medium text-[#25D366]">Saved.</p>
      )}
    </div>
  );
}
