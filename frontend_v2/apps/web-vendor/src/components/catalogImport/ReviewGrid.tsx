import { useMemo, useState } from 'react';
import { Badge, Button } from '@chatlogix/ui';
import type { NormalizedProductDraft, RowBucket } from '../../types/catalogImport';

interface Props {
  readonly drafts: NormalizedProductDraft[];
  readonly onChange: (drafts: NormalizedProductDraft[]) => void;
}

type Group = { title: string; bucket: RowBucket; description: string };

const GROUPS: Group[] = [
  { title: 'Already good', bucket: 'auto_accept', description: 'High-confidence rows, committed as-is.' },
  { title: 'Needs pricing', bucket: 'needs_pricing', description: 'Missing or low-confidence prices — will commit as inactive.' },
  { title: 'Needs review', bucket: 'review', description: 'One or more fields need a glance.' },
  { title: 'Blocked', bucket: 'blocked', description: 'Missing required fields — not committed.' }
];

function classifyLocal(row: NormalizedProductDraft): RowBucket {
  if (!row.name || !row.baseUnit || !row.baseQuantity) return 'blocked';
  const priceConf = row.sourceMeta.fieldConfidence?.basePrice ?? 1;
  if (row.basePrice === null || priceConf < 0.75) return 'needs_pricing';
  const lowNonPrice = Object.entries(row.sourceMeta.fieldConfidence ?? {}).some(
    ([k, v]) => k !== 'basePrice' && v > 0 && v < 0.75
  );
  if ((row.sourceMeta.confidence ?? 0) >= 0.88 && !lowNonPrice) return 'auto_accept';
  return 'review';
}

export function ReviewGrid({ drafts, onChange }: Readonly<Props>) {
  const [expanded, setExpanded] = useState<Record<RowBucket, boolean>>({
    auto_accept: false,
    needs_pricing: true,
    review: true,
    blocked: true
  });

  const grouped = useMemo(() => {
    const out: Record<RowBucket, NormalizedProductDraft[]> = {
      auto_accept: [],
      needs_pricing: [],
      review: [],
      blocked: []
    };
    for (const d of drafts) out[classifyLocal(d)].push(d);
    return out;
  }, [drafts]);

  const update = (rowId: string, patch: Partial<NormalizedProductDraft>) => {
    onChange(drafts.map((d) => (d.rowId === rowId ? { ...d, ...patch } : d)));
  };

  return (
    <div className="space-y-3">
      {GROUPS.map((g) => {
        const rows = grouped[g.bucket];
        if (rows.length === 0) return null;
        const open = expanded[g.bucket];
        return (
          <section key={g.bucket} className="rounded-xl border border-gray-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setExpanded((s) => ({ ...s, [g.bucket]: !open }))}
            >
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  {g.title} <span className="ml-1 text-gray-500">({rows.length})</span>
                </h3>
                <p className="text-xs text-gray-500">{g.description}</p>
              </div>
              <span className="text-xs text-gray-500">{open ? 'hide' : 'show'}</span>
            </button>
            {open && (
              <div className="border-t border-gray-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-left">Qty</th>
                      <th className="px-3 py-2 text-left">Price (₹)</th>
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Conf</th>
                      <th className="px-3 py-2 text-left">Warnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                      <tr key={row.rowId}>
                        <td className="px-3 py-2">
                          <input
                            className="w-44 rounded border border-gray-200 px-2 py-1"
                            value={row.name}
                            onChange={(e) => update(row.rowId, { name: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-20 rounded border border-gray-200 px-2 py-1"
                            value={row.baseUnit}
                            onChange={(e) => update(row.rowId, { baseUnit: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            className="w-20 rounded border border-gray-200 px-2 py-1"
                            value={row.baseQuantity}
                            onChange={(e) =>
                              update(row.rowId, { baseQuantity: Number(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="1"
                            className="w-24 rounded border border-gray-200 px-2 py-1"
                            value={row.basePrice === null ? '' : row.basePrice / 100}
                            placeholder="—"
                            onChange={(e) => {
                              const rupees = e.target.value.trim();
                              update(row.rowId, {
                                basePrice: rupees === '' ? null : Math.round(Number(rupees) * 100),
                                isActive: rupees !== '' && Number(rupees) > 0
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-20 rounded border border-gray-200 px-2 py-1 uppercase"
                            value={row.sku ?? ''}
                            onChange={(e) => update(row.rowId, { sku: e.target.value.toUpperCase() })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              row.sourceMeta.confidence >= 0.88
                                ? 'success'
                                : row.sourceMeta.confidence >= 0.7
                                ? 'info'
                                : 'warning'
                            }
                          >
                            {Math.round(row.sourceMeta.confidence * 100)}%
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {(row.sourceMeta.warnings ?? []).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.bucket === 'auto_accept' && (
                  <div className="flex justify-end border-t border-gray-100 px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded((s) => ({ ...s, auto_accept: false }))}
                    >
                      Collapse auto-accepted
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
