import { Button, Input } from '@chatlogix/ui';
import { onboardingCopy } from './onboardingCopy';
import { createManualProductDraft, ONBOARDING_DEMO_PRODUCT_LIMIT } from '../../lib/productDraft';
import type { NormalizedProductDraft } from '../../types/catalogImport';

interface Props {
  readonly drafts: NormalizedProductDraft[];
  readonly onChange: (drafts: NormalizedProductDraft[]) => void;
  readonly disabled?: boolean;
}

function rupeesValue(paise: number | null): string {
  if (paise === null) return '';
  return String(paise / 100);
}

export function OnboardingProductEditor({ drafts, onChange, disabled }: Props) {
  const copy = onboardingCopy.step2;
  const atLimit = drafts.length >= ONBOARDING_DEMO_PRODUCT_LIMIT;

  const update = (rowId: string, patch: Partial<NormalizedProductDraft>) => {
    onChange(drafts.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const remove = (rowId: string) => {
    onChange(drafts.filter((row) => row.rowId !== rowId));
  };

  return (
    <div className="space-y-3">
      {drafts.map((row, index) => {
        const missingPrice = row.basePrice === null || row.basePrice <= 0;
        return (
          <article
            key={row.rowId}
            className={`rounded-xl border bg-white p-4 ${
              missingPrice ? 'border-yellow-300' : 'border-gray-200'
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-gray-400">
                Item {index + 1} of {drafts.length}
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(row.rowId)}
                className="text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
              >
                {copy.remove}
              </button>
            </div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{copy.nameLabel}</label>
            <Input
              value={row.name}
              disabled={disabled}
              placeholder="e.g. Almond cookies"
              onChange={(e) => update(row.rowId, { name: e.target.value })}
            />
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">{copy.descriptionLabel}</label>
              <textarea
                value={row.description ?? ''}
                disabled={disabled}
                rows={8}
                maxLength={2000}
                placeholder={copy.descriptionPlaceholder}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:bg-gray-50"
                onChange={(e) => update(row.rowId, { description: e.target.value })}
              />
              <p className="mt-1 text-sm text-gray-500">{copy.descriptionNote}</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{copy.priceLabel}</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  disabled={disabled}
                  placeholder="180"
                  value={rupeesValue(row.basePrice)}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const paise = raw === '' ? null : Math.round(Number(raw) * 100);
                    update(row.rowId, {
                      basePrice: paise !== null && Number.isFinite(paise) ? paise : null,
                      isActive: paise !== null && paise > 0,
                    });
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{copy.unitLabel}</label>
                <Input
                  value={row.baseUnit}
                  disabled={disabled}
                  placeholder="box, kg, pcs"
                  onChange={(e) => update(row.rowId, { baseUnit: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{copy.qtyLabel}</label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  disabled={disabled}
                  value={row.baseQuantity}
                  onChange={(e) =>
                    update(row.rowId, { baseQuantity: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            {missingPrice ? (
              <p className="mt-2 text-sm text-yellow-800">{copy.missingPrice}</p>
            ) : null}
          </article>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={disabled || atLimit}
        onClick={() => onChange([...drafts, createManualProductDraft()])}
      >
        {copy.addProduct}
      </Button>
      {atLimit ? <p className="text-center text-sm text-gray-500">{copy.maxProducts}</p> : null}
    </div>
  );
}
