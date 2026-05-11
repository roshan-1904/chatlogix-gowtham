/**
 * Variant manager component for managing product variants.
 * Supports attribute-based variants (size, material, colour, etc.) so the AI
 * can ground answers on exact size/material pricing.
 */

import { Button, Input } from '@chatlogix/ui';
import type { Variant } from '../../types/product';

interface VariantManagerProps {
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
  error?: string;
}

type AttrPair = { key: string; value: string };

function attrsToPairs(attrs?: Record<string, string>): AttrPair[] {
  if (!attrs) return [];
  return Object.entries(attrs).map(([key, value]) => ({ key, value }));
}

function pairsToAttrs(pairs: AttrPair[]): Record<string, string> | undefined {
  const cleaned = pairs.filter(p => p.key.trim() && p.value.trim());
  if (cleaned.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const p of cleaned) out[p.key.trim()] = p.value.trim();
  return out;
}

export function VariantManager({ variants, onChange, error }: VariantManagerProps) {
  const addVariant = () => {
    onChange([
      ...variants,
      {
        label: '',
        attributes: {},
        sku: '',
        unit: '',
        baseQuantity: 1,
        price: 0,
        isDivisible: false,
        isActive: true,
      },
    ]);
  };

  const updateVariant = <K extends keyof Variant>(index: number, field: K, value: Variant[K]) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeVariant = (index: number) => {
    onChange(variants.filter((_, i) => i !== index));
  };

  const updateAttrPair = (index: number, pairIdx: number, field: keyof AttrPair, value: string) => {
    const pairs = attrsToPairs(variants[index].attributes);
    pairs[pairIdx] = { ...pairs[pairIdx], [field]: value };
    updateVariant(index, 'attributes', pairsToAttrs(pairs) || {});
  };

  const addAttrPair = (index: number) => {
    const pairs = attrsToPairs(variants[index].attributes);
    pairs.push({ key: '', value: '' });
    // Keep empty pairs in UI state by not filtering here
    const out: Record<string, string> = {};
    pairs.forEach((p, i) => { out[p.key || `__new${i}`] = p.value; });
    updateVariant(index, 'attributes', out);
  };

  const removeAttrPair = (index: number, pairIdx: number) => {
    const pairs = attrsToPairs(variants[index].attributes);
    pairs.splice(pairIdx, 1);
    updateVariant(index, 'attributes', pairsToAttrs(pairs) || {});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Product Variants</h4>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addVariant}
          disabled={variants.length >= 50}
        >
          + Add Variant
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {variants.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-sm text-gray-500 mb-2">No variants added</p>
          <p className="text-xs text-gray-400">
            Add variants (e.g. 10x10 Kadai, 10x10 Stainless Steel) so the AI can quote exact prices.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {variants.map((variant, index) => {
            const pairs = attrsToPairs(variant.attributes);
            return (
              <div key={index} className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 mb-1">Label</label>
                    <Input
                      type="text"
                      value={variant.label || ''}
                      onChange={(e) => updateVariant(index, 'label', e.target.value)}
                      placeholder="e.g., 10x10 Kadai"
                      className="w-full"
                      maxLength={100}
                    />
                  </div>
                  <div className="flex flex-col items-center pt-6">
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={variant.isActive !== false}
                        onChange={(e) => updateVariant(index, 'isActive', e.target.checked)}
                        className="rounded"
                      />
                      Active
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVariant(index)}
                    className="text-red-600 hover:text-red-800 text-xl font-bold mt-5"
                    aria-label="Remove variant"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-3">
                    <label className="block text-xs text-gray-600 mb-1">Unit</label>
                    <Input
                      type="text"
                      value={variant.unit}
                      onChange={(e) => updateVariant(index, 'unit', e.target.value)}
                      placeholder="piece / box / kg"
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">Qty</label>
                    <Input
                      type="number"
                      value={variant.baseQuantity}
                      onChange={(e) => updateVariant(index, 'baseQuantity', parseFloat(e.target.value) || 0)}
                      min={0.001}
                      step={0.001}
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs text-gray-600 mb-1">Price (₹)</label>
                    <Input
                      type="number"
                      value={variant.price}
                      onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                      min={0.01}
                      step={0.01}
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs text-gray-600 mb-1">SKU</label>
                    <Input
                      type="text"
                      value={variant.sku || ''}
                      onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                      placeholder="optional"
                      className="w-full"
                      maxLength={80}
                    />
                  </div>
                  <div className="col-span-1 flex items-end">
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={variant.isDivisible}
                        onChange={(e) => updateVariant(index, 'isDivisible', e.target.checked)}
                        className="rounded"
                      />
                      Div
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-gray-600">
                      Attributes (size, material, colour, …)
                    </label>
                    <button
                      type="button"
                      onClick={() => addAttrPair(index)}
                      className="text-xs text-primary-600 hover:text-primary-800"
                    >
                      + Add attribute
                    </button>
                  </div>
                  {pairs.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      e.g. size = 10x10, material = Kadai
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {pairs.map((pair, pairIdx) => (
                        <div key={pairIdx} className="grid grid-cols-12 gap-2">
                          <Input
                            type="text"
                            value={pair.key}
                            onChange={(e) => updateAttrPair(index, pairIdx, 'key', e.target.value)}
                            placeholder="key (e.g. size)"
                            className="col-span-5"
                            maxLength={100}
                          />
                          <Input
                            type="text"
                            value={pair.value}
                            onChange={(e) => updateAttrPair(index, pairIdx, 'value', e.target.value)}
                            placeholder="value (e.g. 10x10)"
                            className="col-span-6"
                            maxLength={100}
                          />
                          <button
                            type="button"
                            onClick={() => removeAttrPair(index, pairIdx)}
                            className="col-span-1 text-red-600 hover:text-red-800"
                            aria-label="Remove attribute"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Each variant is an exact, priced SKU. Add one row per size/material combo so the AI can
        answer "price for 10x10 Kadai?" without guessing.
      </p>
    </div>
  );
}
