import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { requestUploadUrl, uploadToS3 } from '../../lib/catalogImport';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TABULAR_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TABULAR_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

export interface UploadedKey {
  file: File;
  key: string;
  kind: 'image' | 'tabular';
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
            jobId
          });
          await uploadToS3(presignedUrl, file, (loaded, total) => {
            setProgress((p) => ({ ...p, [file.name]: Math.round((loaded / total) * 100) }));
          });
          onUploaded({ file, key: s3Key, kind });
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
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
          disabled ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-primary-500 cursor-pointer'
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (disabled) return;
          if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-sm text-gray-700">
          Drop brochure images (JPG/PNG/WebP) or a CSV/XLSX here, or click to choose.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Up to {maxImages} images (8 MB each) + one tabular file (5 MB).
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
      {Object.entries(progress).length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {Object.entries(progress).map(([name, pct]) => (
            <li key={name} className="flex items-center gap-2">
              <span className="flex-1 truncate text-gray-700">{name}</span>
              <span className="text-gray-500">{pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
