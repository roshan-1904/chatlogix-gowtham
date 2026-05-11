import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import { fastPhoto, requestUploadUrl, uploadToS3 } from '../lib/catalogImport';
import { useCatalogImportEnabled } from '../hooks/useVendorConfig';
import { createProduct } from '../lib/products';
import type { NormalizedProductDraft } from '../types/catalogImport';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

export function CatalogImportPhoto() {
  const navigate = useNavigate();
  const enabled = useCatalogImportEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<NormalizedProductDraft | null>(null);
  const [rupees, setRupees] = useState('');

  const onFile = async (file: File) => {
    if (!ACCEPT.includes(file.type)) {
      toast.error('JPG, PNG, or WebP only');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image exceeds 8 MB cap');
      return;
    }
    setBusy(true);
    const toastId = toast.loading('Reading photo…');
    try {
      const { s3Key, presignedUrl } = await requestUploadUrl({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size
      });
      await uploadToS3(presignedUrl, file);
      const out = await fastPhoto(s3Key);
      setDraft(out.draft);
      if (out.draft.basePrice !== null) setRupees(String(out.draft.basePrice / 100));
      toast.success('Extracted — set a price and save', { id: toastId });
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const priceRupees = rupees.trim() === '' ? null : Number(rupees);
    if (priceRupees === null || !Number.isFinite(priceRupees) || priceRupees <= 0) {
      toast.error('Enter a price to go live');
      return;
    }
    setBusy(true);
    const toastId = toast.loading('Saving product…');
    try {
      await createProduct({
        name: draft.name,
        description: draft.description ?? '',
        tags: [],
        basePrice: priceRupees,
        baseUnit: draft.baseUnit,
        baseQuantity: draft.baseQuantity,
        isDivisible: false,
        inStock: true,
        keywords: draft.keywords,
        isActive: true
      });
      toast.success('Product saved', { id: toastId });
      navigate('/catalog');
    } catch (err) {
      toast.error((err as Error).message, { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  if (enabled === false) {
    return <div className="p-6 text-sm text-gray-600">Smart Import isn&apos;t enabled.</div>;
  }

  return (
    <div className="space-y-4 p-1 sm:p-2">
      <header>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">One-photo add</h1>
        <p className="text-xs text-gray-500 sm:text-sm">
          Snap or upload a single product photo. AI fills the details; you only set
          the price.
        </p>
      </header>

      {!draft && (
        <div
          className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center cursor-pointer hover:border-primary-500"
          onClick={() => inputRef.current?.click()}
        >
          <p className="text-sm text-gray-700">Click to choose or capture a photo</p>
          <p className="mt-1 text-xs text-gray-500">JPG, PNG, or WebP. Up to 8 MB.</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(',')}
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = '';
            }}
            disabled={busy}
          />
        </div>
      )}

      {draft && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit" value={draft.baseUnit} onChange={(v) => setDraft({ ...draft, baseUnit: v })} />
            <Field
              label="Quantity"
              type="number"
              value={String(draft.baseQuantity)}
              onChange={(v) => setDraft({ ...draft, baseQuantity: Number(v) || 0 })}
            />
          </div>
          <Field
            label="Price (₹)"
            type="number"
            value={rupees}
            onChange={setRupees}
            placeholder="Set a price to go live"
          />
          <Field
            label="Description"
            value={draft.description ?? ''}
            onChange={(v) => setDraft({ ...draft, description: v })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Try another
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save product'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly type?: string;
  readonly placeholder?: string;
}

function Field({ label, value, onChange, type = 'text', placeholder }: Readonly<FieldProps>) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <input
        type={type}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
