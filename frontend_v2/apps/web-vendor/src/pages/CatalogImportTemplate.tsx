import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { fastTemplate, isTemplateAvailable } from '../lib/catalogImport';
import { createProduct } from '../lib/products';
import { useCatalogImportEnabled, useVendorConfig } from '../hooks/useVendorConfig';
import type { NormalizedProductDraft } from '../types/catalogImport';

type RowEdit = NormalizedProductDraft & { _rupees: string; _selected: boolean };

export function CatalogImportTemplate() {
  const navigate = useNavigate();
  const enabled = useCatalogImportEnabled();
  const { data: config } = useVendorConfig();
  const category = (config?.category ?? '').trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [rows, setRows] = useState<RowEdit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!category) return;
    void (async () => {
      try {
        const avail = await isTemplateAvailable(category);
        setAvailable(avail);
        if (avail) {
          const out = await fastTemplate(category);
          setRows(out.products.map((p) => ({ ...p, _rupees: '', _selected: true })));
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [category]);

  const update = (rowId: string, patch: Partial<RowEdit>) => {
    setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    const approved = rows.filter((r) => r._selected && r._rupees.trim() !== '');
    if (approved.length === 0) {
      toast.error('Select at least one row and set a price.');
      return;
    }
    setBusy(true);
    const toastId = toast.loading(`Saving ${approved.length} products…`);
    let saved = 0;
    for (const r of approved) {
      const priceRupees = Number(r._rupees);
      if (!Number.isFinite(priceRupees) || priceRupees <= 0) continue;
      try {
        await createProduct({
          name: r.name,
          description: r.description ?? '',
          tags: [],
          basePrice: priceRupees,
          baseUnit: r.baseUnit,
          baseQuantity: r.baseQuantity,
          isDivisible: false,
          inStock: true,
          keywords: r.keywords,
          isActive: true
        });
        saved += 1;
      } catch (err) {
        console.warn('template save failed', r.name, err);
      }
    }
    setBusy(false);
    toast.success(`Saved ${saved} / ${approved.length}`, { id: toastId });
    navigate('/catalog');
  };

  if (enabled === false) {
    return <div className="p-6 text-sm text-gray-600">Smart Import isn&apos;t enabled.</div>;
  }
  if (loading) return <div className="p-6 text-sm text-gray-600">Loading template…</div>;

  if (!category) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Set your shop category in Settings first — templates are category-specific.
      </div>
    );
  }
  if (available === false) {
    return (
      <div className="p-6 text-sm text-gray-600">
        No ready-made template for <strong>{category}</strong> yet. Try brochure
        upload or one-photo add instead.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1 sm:p-2">
      <header>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Start from a {category} template
        </h1>
        <p className="text-xs text-gray-500 sm:text-sm">
          Pick the items you sell and set prices. Unchecked rows are ignored.
        </p>
      </header>

      <div className="rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">Qty</th>
              <th className="px-3 py-2 text-left">Price (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.rowId}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={r._selected}
                    onChange={(e) => update(r.rowId, { _selected: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-56 rounded border border-gray-200 px-2 py-1"
                    value={r.name}
                    onChange={(e) => update(r.rowId, { name: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-20 rounded border border-gray-200 px-2 py-1"
                    value={r.baseUnit}
                    onChange={(e) => update(r.rowId, { baseUnit: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-20 rounded border border-gray-200 px-2 py-1"
                    value={r.baseQuantity}
                    onChange={(e) => update(r.rowId, { baseQuantity: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="1"
                    className="w-24 rounded border border-gray-200 px-2 py-1"
                    placeholder="—"
                    value={r._rupees}
                    onChange={(e) => update(r.rowId, { _rupees: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate('/catalog')} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save selected'}
        </Button>
      </div>
    </div>
  );
}
