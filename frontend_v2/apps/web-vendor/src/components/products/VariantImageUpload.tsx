/**
 * Single image upload for one product variant (edit product only).
 */

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import type { ProductMedia } from '../../types/product';
import {
  commitProductMedia,
  deleteProductMedia,
  PRODUCT_IMAGE_TYPES,
  PRODUCT_MEDIA_MAX_IMAGE_BYTES,
  requestProductMediaUploadUrl,
  uploadProductMediaViaApi,
} from '../../lib/products';
import { useAuthenticatedMedia } from '../conversations/bubbles/shared/useAuthenticatedMedia';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readImageMeta(file: File): Promise<{ width?: number; height?: number }> {
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

interface VariantImageUploadProps {
  readonly productId: string;
  readonly variantSku: string;
  readonly media: ProductMedia | null;
  readonly disabled?: boolean;
  readonly onChange: (media: ProductMedia | null) => void;
}

export function VariantImageUpload({
  productId,
  variantSku,
  media,
  disabled = false,
  onChange,
}: VariantImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { objectUrl, isLoading } = useAuthenticatedMedia(media?.previewUrl ?? null);

  const uploadFile = async (file: File) => {
    if (!PRODUCT_IMAGE_TYPES.includes(file.type)) {
      toast.error('Use JPG, PNG, or WebP for variant photos');
      return;
    }
    if (file.size > PRODUCT_MEDIA_MAX_IMAGE_BYTES) {
      toast.error(`Image exceeds ${formatBytes(PRODUCT_MEDIA_MAX_IMAGE_BYTES)} limit`);
      return;
    }

    setUploading(true);
    try {
      const urlResponse = await requestProductMediaUploadUrl(productId, {
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        variantSku,
      });

      if (!urlResponse.uploadViaApi || !urlResponse.uploadUrl) {
        throw new Error('Server did not return an upload target');
      }

      await uploadProductMediaViaApi(
        urlResponse.uploadUrl,
        file,
        urlResponse.requiredHeaders,
      );

      const meta = await readImageMeta(file);
      const created = await commitProductMedia(productId, {
        s3Key: urlResponse.s3Key,
        variantSku,
        ...(meta.width ? { width: meta.width, height: meta.height } : {}),
      });

      onChange(created);
      toast.success('Variant photo uploaded');
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!media) return;
    setUploading(true);
    try {
      await deleteProductMedia(productId, media.id);
      onChange(null);
      toast.success('Variant photo removed');
    } catch (err) {
      toast.error((err as Error).message || 'Could not remove photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
        {objectUrl ? (
          <img src={objectUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
            {isLoading ? '…' : 'No photo'}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={PRODUCT_IMAGE_TYPES.join(',')}
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void uploadFile(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : media ? 'Replace photo' : 'Upload photo'}
        </Button>
        {media ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => void remove()}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <p className="text-[10px] text-gray-400 sm:ml-1">
        One image per variant for WhatsApp (SKU: {variantSku})
      </p>
    </div>
  );
}
