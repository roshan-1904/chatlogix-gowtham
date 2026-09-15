/**
 * Product catalog media — images & videos for WhatsApp send (edit product only).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import toast from 'react-hot-toast';
import { Button, Input } from '@chatlogix/ui';
import type { ProductMedia } from '../../types/product';
import {
  commitProductMedia,
  deleteProductMedia,
  MAX_MEDIA_PER_PRODUCT,
  PRODUCT_IMAGE_TYPES,
  PRODUCT_MEDIA_MAX_IMAGE_BYTES,
  PRODUCT_MEDIA_MAX_VIDEO_BYTES,
  PRODUCT_VIDEO_TYPES,
  reorderProductMedia,
  requestProductMediaUploadUrl,
  updateProductMedia,
  uploadProductMediaToS3,
  uploadProductMediaViaApi,
} from '../../lib/products';
import { useAuthenticatedMedia } from '../conversations/bubbles/shared/useAuthenticatedMedia';

const ACCEPT = [...PRODUCT_IMAGE_TYPES, ...PRODUCT_VIDEO_TYPES].join(',');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readImageMeta(file: File): Promise<{ width?: number; height?: number }> {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type)) return {};
  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Could not read image dimensions'));
      img.src = url;
    });
    return dims;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readVideoMeta(
  file: File,
): Promise<{ width?: number; height?: number; durationSec?: number }> {
  if (!PRODUCT_VIDEO_TYPES.includes(file.type)) return {};
  const url = URL.createObjectURL(file);
  try {
    const meta = await new Promise<{ width: number; height: number; durationSec: number }>(
      (resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          resolve({
            width: video.videoWidth,
            height: video.videoHeight,
            durationSec: Math.max(1, Math.round(video.duration)),
          });
        };
        video.onerror = () => reject(new Error('Could not read video metadata'));
        video.src = url;
      },
    );
    return meta;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function MediaThumb({
  item,
  variant = 'cover',
}: {
  readonly item: ProductMedia;
  readonly variant?: 'cover' | 'contain';
}) {
  const { objectUrl, isLoading, error } = useAuthenticatedMedia(item.previewUrl);
  const fitClass = variant === 'contain' ? 'object-contain' : 'object-cover';

  if (item.kind === 'video') {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-gray-900">
        {objectUrl && !error ? (
          <video
            src={objectUrl}
            className={`h-full w-full ${fitClass}`}
            muted
            playsInline
            preload="metadata"
            controls={variant === 'contain'}
          />
        ) : (
          <span className="text-xs font-medium text-white/80">
            {isLoading ? '…' : 'Video'}
          </span>
        )}
        {variant === 'cover' ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            MP4
          </span>
        ) : null}
      </div>
    );
  }

  if (objectUrl && !error) {
    return <img src={objectUrl} alt="" className={`h-full w-full ${fitClass}`} />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xs text-gray-500">
      {isLoading ? 'Loading…' : 'Preview'}
    </div>
  );
}

function ProductMediaPreviewModal({
  item,
  onClose,
}: {
  readonly item: ProductMedia;
  readonly onClose: () => void;
}) {
  const title = item.label?.trim() || (item.kind === 'video' ? 'Video' : 'Image');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close preview"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
      <div
        className="flex max-h-[min(90vh,900px)] max-w-[min(96vw,1100px)] flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[min(82vh,820px)] w-full overflow-hidden rounded-lg bg-black/40">
          <div className="flex h-[min(82vh,820px)] w-full items-center justify-center">
            <MediaThumb item={item} variant="contain" />
          </div>
        </div>
        <p className="mt-3 max-w-full truncate text-center text-sm text-white/90">{title}</p>
      </div>
    </div>
  );
}

interface ProductMediaGalleryProps {
  readonly productId: string;
  readonly initialMedia?: ProductMedia[];
  readonly disabled?: boolean;
  readonly onMediaChange?: (media: ProductMedia[]) => void;
}

export function ProductMediaGallery({
  productId,
  initialMedia = [],
  disabled = false,
  onMediaChange,
}: ProductMediaGalleryProps) {
  const [items, setItems] = useState<ProductMedia[]>(() =>
    [...initialMedia].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [previewItem, setPreviewItem] = useState<ProductMedia | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems([...initialMedia].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [initialMedia]);

  const sync = useCallback(
    (next: ProductMedia[]) => {
      setItems(next);
      onMediaChange?.(next);
    },
    [onMediaChange],
  );

  const atCap = items.filter((m) => m.isActive).length >= MAX_MEDIA_PER_PRODUCT;

  const validateFile = (file: File): boolean => {
    const isImage = PRODUCT_IMAGE_TYPES.includes(file.type);
    const isVideo = PRODUCT_VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) {
      toast.error(`${file.name}: use JPG, PNG, WebP, MP4, or 3GPP`);
      return false;
    }
    const max = isImage ? PRODUCT_MEDIA_MAX_IMAGE_BYTES : PRODUCT_MEDIA_MAX_VIDEO_BYTES;
    if (file.size > max) {
      toast.error(`${file.name}: exceeds ${formatBytes(max)} limit`);
      return false;
    }
    if (atCap) {
      toast.error(`Maximum ${MAX_MEDIA_PER_PRODUCT} photos or videos per product`);
      return false;
    }
    return true;
  };

  const uploadOne = async (file: File) => {
    if (!validateFile(file)) return;

    const progressKey = `${file.name}-${file.size}`;
    setUploadProgress((p) => ({ ...p, [progressKey]: 0 }));

    try {
      const contentType = file.type || 'application/octet-stream';
      const urlResponse = await requestProductMediaUploadUrl(productId, {
        filename: file.name,
        contentType,
        sizeBytes: file.size,
      });
      const { s3Key, requiredHeaders } = urlResponse;

      const onProgress = (loaded: number, total: number) => {
        setUploadProgress((p) => ({
          ...p,
          [progressKey]: Math.round((loaded / total) * 100),
        }));
      };

      if (urlResponse.uploadViaApi && urlResponse.uploadUrl) {
        await uploadProductMediaViaApi(urlResponse.uploadUrl, file, requiredHeaders, onProgress);
      } else if (urlResponse.presignedUrl) {
        await uploadProductMediaToS3(urlResponse.presignedUrl, file, requiredHeaders, onProgress);
      } else {
        throw new Error('Server did not return an upload target');
      }

      const [imageMeta, videoMeta] = await Promise.all([
        readImageMeta(file),
        readVideoMeta(file),
      ]);

      const created = await commitProductMedia(productId, {
        s3Key,
        sortOrder: items.length,
        ...(imageMeta.width ? { width: imageMeta.width, height: imageMeta.height } : {}),
        ...(videoMeta.width
          ? {
              width: videoMeta.width,
              height: videoMeta.height,
              durationSec: videoMeta.durationSec,
            }
          : {}),
      });

      const next = [...items, created].sort((a, b) => a.sortOrder - b.sortOrder);
      sync(next);
      toast.success(`${file.name} uploaded`);
    } catch (err) {
      toast.error(`${file.name}: ${(err as Error).message}`);
    } finally {
      setUploadProgress((p) => {
        const next = { ...p };
        delete next[progressKey];
        return next;
      });
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (items.filter((m) => m.isActive).length >= MAX_MEDIA_PER_PRODUCT) break;
      await uploadOne(file);
    }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(target, 0, removed);
    setBusyId('reorder');
    try {
      const fromApi = await reorderProductMedia(productId, reordered.map((m) => m.id));
      sync(fromApi.filter((m) => m.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      toast.error((err as Error).message || 'Could not reorder');
    } finally {
      setBusyId(null);
    }
  };

  const saveLabel = async (mediaId: string, label: string) => {
    setBusyId(mediaId);
    try {
      const updated = await updateProductMedia(productId, mediaId, {
        label: label.trim() || null,
      });
      sync(items.map((m) => (m.id === mediaId ? updated : m)));
    } catch (err) {
      toast.error((err as Error).message || 'Could not save label');
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (mediaId: string) => {
    setBusyId(mediaId);
    try {
      await deleteProductMedia(productId, mediaId);
      sync(items.filter((m) => m.id !== mediaId));
      toast.success('Media removed');
    } catch (err) {
      toast.error((err as Error).message || 'Could not delete');
    } finally {
      setBusyId(null);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled && !atCap) setDragOver(true);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Photos and short videos customers can receive on WhatsApp when they ask about this product.
        Up to {MAX_MEDIA_PER_PRODUCT} files · images {formatBytes(PRODUCT_MEDIA_MAX_IMAGE_BYTES)} ·
        videos {formatBytes(PRODUCT_MEDIA_MAX_VIDEO_BYTES)}.
      </p>

      <div
        role="button"
        tabIndex={disabled || atCap ? -1 : 0}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          disabled || atCap
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-70'
            : dragOver
              ? 'cursor-pointer border-secondary-500 bg-secondary-50/40'
              : 'cursor-pointer border-gray-300 bg-gray-50/50 hover:border-primary-400 hover:bg-primary-50/30'
        }`}
        onClick={() => !disabled && !atCap && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled && !atCap) inputRef.current?.click();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled || atCap) return;
          if (e.dataTransfer.files.length > 0) void handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-500">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 16V4m0 0L8 8m4-4l4 4M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-800">
          {atCap ? 'Media limit reached' : 'Drop files here or click to upload'}
        </p>
        <p className="mt-1 text-xs text-gray-500">JPG, PNG, WebP · MP4, 3GPP</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPT}
          disabled={disabled || atCap}
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.currentTarget.value = '';
          }}
        />
      </div>

      {Object.entries(uploadProgress).length > 0 && (
        <ul className="space-y-2">
          {Object.entries(uploadProgress).map(([key, pct]) => (
            <li key={key}>
              <div className="mb-0.5 flex justify-between text-xs text-gray-600">
                <span className="truncate pr-2">{key.split('-')[0]}</span>
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

      {items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:gap-4"
            >
              <button
                type="button"
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-offset-2 transition hover:ring-2 hover:ring-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-24 sm:w-24"
                aria-label={`View ${item.kind}${item.label ? `: ${item.label}` : ''}`}
                onClick={() => setPreviewItem(item)}
              >
                <MediaThumb item={item} />
                <span
                  className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    item.kind === 'video'
                      ? 'bg-primary-500 text-white'
                      : 'bg-white/90 text-primary-600'
                  }`}
                >
                  {item.kind}
                </span>
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  type="text"
                  placeholder="Label (e.g. Front view)"
                  value={labelDrafts[item.id] ?? item.label ?? ''}
                  maxLength={120}
                  disabled={disabled || busyId === item.id}
                  onChange={(e) =>
                    setLabelDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                  }
                  onBlur={(e) => {
                    const trimmed = e.target.value.trim();
                    const committed = (item.label ?? '').trim();
                    if (trimmed !== committed) {
                      void saveLabel(item.id, trimmed);
                    }
                    setLabelDrafts((d) => {
                      const next = { ...d };
                      delete next[item.id];
                      return next;
                    });
                  }}
                  className="w-full text-sm"
                />
                <p className="text-[11px] text-gray-500">{formatBytes(item.fileSizeBytes)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || index === 0 || busyId !== null}
                    onClick={() => void moveItem(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled || index === items.length - 1 || busyId !== null}
                    onClick={() => void moveItem(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={disabled || busyId === item.id}
                    isLoading={busyId === item.id}
                    onClick={() => void removeItem(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No media yet — upload at least one photo for customers.</p>
      )}

      {previewItem ? (
        <ProductMediaPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      ) : null}
    </div>
  );
}
