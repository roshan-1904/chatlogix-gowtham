import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { requestUploadUrl, uploadToS3 } from '../../lib/catalogImport';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TABULAR_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TABULAR_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export interface UploadedKey {
  file: File;
  key: string;
  kind: 'image' | 'tabular';
  previewUrl?: string;
}

interface Props {
  readonly jobId: string;
  readonly maxImages?: number;
  readonly onUploaded: (entry: UploadedKey) => void;
  readonly disabled?: boolean;
}

export function UploadDropzone({ jobId, maxImages = 20, onUploaded, disabled }: Readonly<Props>) {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [imagesUploaded, setImagesUploaded] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [thumbnails, setThumbnails] = useState<Array<{ name: string; url: string; kind: 'image' | 'tabular' }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((file: File): 'image' | 'tabular' | null => {
    if (IMAGE_TYPES.includes(file.type)) {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name}: image exceeds 8 MB cap`);
        return null;
      }
      return 'image';
    }
    if (
      TABULAR_TYPES.includes(file.type) ||
      file.name.toLowerCase().endsWith('.csv') ||
      file.name.toLowerCase().endsWith('.xlsx')
    ) {
      if (file.size > MAX_TABULAR_BYTES) {
        toast.error(`${file.name}: file exceeds 5 MB cap`);
        return null;
      }
      return 'tabular';
    }
    toast.error(`${file.name}: unsupported type (${file.type || 'unknown'})`);
    return null;
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const kind = validate(file);
        if (!kind) continue;
        if (kind === 'image' && imagesUploaded >= maxImages) {
          toast.error(`Only ${maxImages} images allowed per job`);
          continue;
        }
        try {
          const { s3Key, presignedUrl } = await requestUploadUrl({
            filename: file.name,
            contentType: file.type || (kind === 'image' ? 'image/jpeg' : 'text/csv'),
            sizeBytes: file.size,
            jobId,
          });
          await uploadToS3(presignedUrl, file, (loaded, total) => {
            setProgress((p) => ({ ...p, [file.name]: Math.round((loaded / total) * 100) }));
          });
          const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined;
          onUploaded({ file, key: s3Key, kind, previewUrl });
          setThumbnails((prev) => [
            ...prev,
            {
              name: file.name,
              url: previewUrl ?? '',
              kind,
            },
          ]);
          if (kind === 'image') setImagesUploaded((n) => n + 1);
          setProgress((p) => ({ ...p, [file.name]: 100 }));
        } catch (err) {
          toast.error(`${file.name}: ${(err as Error).message}`);
        }
      }
    },
    [jobId, maxImages, imagesUploaded, onUploaded, validate]
  );

  return (
    <div>
      <div
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          disabled
            ? 'cursor-not-allowed border-gray-200 bg-gray-50'
            : dragOver
              ? 'cursor-pointer border-secondary-500 bg-secondary-50/40'
              : 'cursor-pointer border-gray-300 bg-gray-50/50 hover:border-primary-400 hover:bg-primary-50/30'
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-500">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 16V4m0 0L8 8m4-4l4 4M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-800">Drop your menu or price list here</p>
        <p className="mt-1 text-xs text-gray-500">
          Photos (JPG, PNG, WebP) or spreadsheet (CSV, XLSX) · up to {maxImages} images
        </p>
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          multiple
          accept={[...IMAGE_TYPES, ...TABULAR_TYPES, '.csv', '.xlsx'].join(',')}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.currentTarget.value = '';
          }}
          disabled={disabled}
        />
      </div>

      {thumbnails.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {thumbnails.map((t) => (
            <li
              key={t.name}
              className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
            >
              {t.kind === 'image' && t.url ? (
                <img src={t.url} alt="" className="h-16 w-16 rounded-md object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-md bg-gray-100 text-xs font-medium text-gray-600">
                  {t.name.split('.').pop()?.toUpperCase() ?? 'FILE'}
                </div>
              )}
              <span className="max-w-[88px] truncate text-[10px] text-gray-600">{t.name}</span>
            </li>
          ))}
        </ul>
      )}

      {Object.entries(progress).length > 0 && (
        <ul className="mt-3 space-y-2">
          {Object.entries(progress).map(([name, pct]) => (
            <li key={name}>
              <div className="mb-0.5 flex items-center justify-between text-xs text-gray-600">
                <span className="truncate pr-2">{name}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-secondary-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
