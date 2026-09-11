import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@chatlogix/ui';
import { PriceCalculator } from '../products/PriceCalculator';
import { onboardingCopy } from './onboardingCopy';
import { createManualProductDraft, ONBOARDING_DEMO_PRODUCT_LIMIT } from '../../lib/productDraft';
import { UNIT_OPTIONS } from '../../lib/productUnits';
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

function qtyUnitLabel(row: NormalizedProductDraft): string {
  const qty = row.baseQuantity > 0 ? String(row.baseQuantity) : '';
  const unit = row.baseUnit.trim();
  return [qty, unit].filter(Boolean).join(' ') || '—';
}

export function OnboardingProductEditor({ drafts, onChange, disabled }: Props) {
  const copy = onboardingCopy.step2;
  const atLimit = drafts.length >= ONBOARDING_DEMO_PRODUCT_LIMIT;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const prevIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const ids = drafts.map((row) => row.rowId);
    const prevIds = prevIdsRef.current;
    const added = ids.filter((id) => !prevIds.includes(id));
    prevIdsRef.current = ids;

    if (added.length > 0 && ids.length === prevIds.length + added.length && added.length <= 3) {
      setExpandedId(added[0]);
      return;
    }
    setExpandedId((current) => (current && ids.includes(current) ? current : null));
  }, [drafts]);

  const update = (rowId: string, patch: Partial<NormalizedProductDraft>) => {
    onChange(drafts.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const remove = (rowId: string) => {
    onChange(drafts.filter((row) => row.rowId !== rowId));
  };

  return (
    <div className="space-y-2">
      {drafts.map((row) => {
        const missingPrice = row.basePrice === null || row.basePrice <= 0;
        const expanded = expandedId === row.rowId;
        const basePriceRupees = row.basePrice != null && row.basePrice > 0 ? row.basePrice / 100 : 0;
        const showPricePreview =
          row.baseUnit.trim().length > 0 && basePriceRupees > 0 && row.baseQuantity > 0;

        return (
          <article
            key={row.rowId}
            className={`rounded-xl border bg-white ${
              missingPrice ? 'border-yellow-300' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Input
                  value={row.name}
                  disabled={disabled}
                  placeholder="e.g. Almond cookies"
                  aria-label={copy.nameLabel}
                  onChange={(e) => update(row.rowId, { name: e.target.value })}
                />
              </div>
              <div className="w-[5.5rem] shrink-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">₹</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    disabled={disabled}
                    placeholder="180"
                    aria-label={copy.priceLabel}
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
              </div>
              <p className="hidden w-16 shrink-0 truncate text-xs text-gray-500 sm:block">
                {qtyUnitLabel(row)}
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setExpandedId(expanded ? null : row.rowId)}
                className="shrink-0 text-sm font-medium text-primary-600 hover:text-primary-800 disabled:opacity-50"
              >
                {expanded ? copy.done : copy.edit}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(row.rowId)}
                className="shrink-0 text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
              >
                {copy.remove}
              </button>
            </div>

            {missingPrice && !expanded ? (
              <p className="border-t border-yellow-100 px-3 pb-2 text-xs text-yellow-800">{copy.missingPrice}</p>
            ) : null}

            {expanded ? (
              <div className="space-y-3 border-t border-gray-100 px-3 pb-3 pt-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{copy.descriptionLabel}</label>
                  <textarea
                    value={row.description ?? ''}
                    disabled={disabled}
                    rows={4}
                    maxLength={2000}
                    placeholder={copy.descriptionPlaceholder}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:bg-gray-50"
                    onChange={(e) => update(row.rowId, { description: e.target.value })}
                  />
                  <p className="mt-1 text-sm text-gray-500">{copy.descriptionNote}</p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">{copy.pricingSection}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{copy.unitLabel}</label>
                      <select
                        value={row.baseUnit}
                        disabled={disabled}
                        onChange={(e) => update(row.rowId, { baseUnit: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                      >
                        <option value="">Select unit</option>
                        {UNIT_OPTIONS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{copy.qtyLabel}</label>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        disabled={disabled}
                        value={row.baseQuantity}
                        onChange={(e) =>
                          update(row.rowId, { baseQuantity: Number(e.target.value) || 0 })
                        }
                      />
                      <p className="mt-1 text-xs text-gray-500">{copy.baseQtyHint}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{copy.priceLabel}</label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={disabled}
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
                      <p className="mt-1 text-xs text-gray-500">{copy.basePriceHint}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`isDivisible-${row.rowId}`}
                      checked={row.isDivisible ?? false}
                      disabled={disabled}
                      onChange={(e) => update(row.rowId, { isDivisible: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor={`isDivisible-${row.rowId}`} className="text-sm text-gray-700">
                      {copy.isDivisibleLabel}
                    </label>
                  </div>
                  <p className="ml-6 mt-1 text-xs text-gray-500">{copy.isDivisibleHint}</p>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{copy.minQtyLabel}</label>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        disabled={disabled}
                        value={row.minOrderQuantity ?? ''}
                        onChange={(e) =>
                          update(row.rowId, {
                            minOrderQuantity: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">{copy.maxQtyLabel}</label>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        disabled={disabled}
                        value={row.maxOrderQuantity ?? ''}
                        onChange={(e) =>
                          update(row.rowId, {
                            maxOrderQuantity: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </div>
                  </div>

                  {showPricePreview ? (
                    <div className="mt-3">
                      <PriceCalculator
                        basePrice={basePriceRupees}
                        baseQuantity={row.baseQuantity}
                        baseUnit={row.baseUnit}
                        isDivisible={row.isDivisible ?? false}
                        minOrderQuantity={row.minOrderQuantity}
                        maxOrderQuantity={row.maxOrderQuantity}
                      />
                    </div>
                  ) : null}
                </div>

                {missingPrice ? (
                  <p className="text-sm text-yellow-800">{copy.missingPrice}</p>
                ) : null}
              </div>
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
