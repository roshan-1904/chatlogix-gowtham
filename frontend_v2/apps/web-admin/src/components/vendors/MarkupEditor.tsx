import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@chatlogix/ui';
import { MAX_MARKUP_PERCENT, MIN_MARKUP_PERCENT, updateVendorMarkup } from '../../lib/vendors';
import { formatWalletAmount } from '../../lib/money';

/** A typical AI reply before markup, used to make the percentage concrete. */
const EXAMPLE_BASE_MILLI = 260;

interface MarkupEditorProps {
  vendorId: string;
  markupPercent: number;
}

function parseMarkup(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  if (n < MIN_MARKUP_PERCENT || n > MAX_MARKUP_PERCENT) return null;
  return n;
}

export function MarkupEditor({ vendorId, markupPercent }: MarkupEditorProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(String(markupPercent));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(String(markupPercent));
    setSaved(false);
  }, [vendorId, markupPercent]);

  const parsed = parseMarkup(draft);
  const isDirty = parsed !== null && parsed !== markupPercent;

  const save = useMutation({
    mutationFn: async () => {
      if (parsed === null) throw new Error('Enter a whole number between 0 and 500');
      return updateVendorMarkup(vendorId, parsed);
    },
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['admin-vendors'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-vendor', vendorId] });
    },
  });

  const previewPercent = parsed ?? markupPercent;
  const previewChargeMilli = Math.ceil(EXAMPLE_BASE_MILLI * (1 + previewPercent / 100));

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="markup-percent" className="block text-sm font-medium text-gray-700">
          Markup
        </label>
        <p className="mt-0.5 text-xs text-gray-500">
          Added on top of what a message actually costs us. Whole number, 0 to 500.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            id="markup-percent"
            type="number"
            inputMode="numeric"
            min={MIN_MARKUP_PERCENT}
            max={MAX_MARKUP_PERCENT}
            step={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
              save.reset();
            }}
            className="w-28 rounded-lg border border-gray-300 py-2 pl-3 pr-7 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            %
          </span>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!isDirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save markup'}
        </Button>
      </div>

      <p className="text-xs text-gray-600">
        At {previewPercent}%, a reply that costs {formatWalletAmount(EXAMPLE_BASE_MILLI)} to run is charged{' '}
        <span className="font-semibold text-[#072349]">{formatWalletAmount(previewChargeMilli)}</span>.
      </p>

      {parsed === null && draft.trim() !== '' && (
        <p className="text-xs text-red-600">Enter a whole number between 0 and 500.</p>
      )}
      {save.isError && (
        <p className="text-xs text-red-600">
          {save.error instanceof Error ? save.error.message : 'Could not save the markup.'}
        </p>
      )}
      {saved && !isDirty && !save.isError && (
        <p className="text-xs font-medium text-[#25D366]">Saved.</p>
      )}
    </div>
  );
}
