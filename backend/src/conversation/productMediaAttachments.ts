import { prisma } from '../db/prisma.js';
import type { CartOp } from './types.js';

export const MAX_OUTBOUND_IMAGES_PER_TURN = 3;
export const MAX_OUTBOUND_VIDEOS_PER_TURN = 1;
const MAX_CAPTION_CHARS = 1024;

export type ResolvedOutboundAttachment = {
  productMediaId: string;
  kind: 'image' | 'video';
  caption?: string;
};

/** Queue / dispatcher shape after persist assigns messageId. */
export type OutboundMediaAttachment = ResolvedOutboundAttachment & {
  messageId: string;
};

export function collectSendProductMediaOps(ops: CartOp[]): Extract<CartOp, { type: 'send_product_media' }>[] {
  const seen = new Set<string>();
  const out: Extract<CartOp, { type: 'send_product_media' }>[] = [];
  for (const op of ops) {
    if (op.type !== 'send_product_media') continue;
    if (seen.has(op.productId)) continue;
    seen.add(op.productId);
    out.push(op);
  }
  return out;
}

function truncateCaption(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= MAX_CAPTION_CHARS ? trimmed : `${trimmed.slice(0, MAX_CAPTION_CHARS - 1)}…`;
}

/**
 * Resolve active ProductMedia rows for LLM-1 send_product_media ops (PM6).
 * One turn sends either up to 3 images or 1 video — never both. If any op
 * requests video, only the first matching video is sent; otherwise up to 3
 * images across ops (sortOrder on each product).
 */
export async function resolveProductMediaAttachments(
  vendorId: string,
  mediaOps: Extract<CartOp, { type: 'send_product_media' }>[],
  captionSource?: string
): Promise<ResolvedOutboundAttachment[]> {
  if (mediaOps.length === 0) return [];

  const wantsVideo = mediaOps.some((op) => op.kind === 'video');
  const caption = truncateCaption(captionSource);

  const resolved: ResolvedOutboundAttachment[] = [];

  if (wantsVideo) {
    for (const op of mediaOps) {
      if (op.kind === 'image') continue;
      const row = await prisma.productMedia.findFirst({
        where: {
          vendorId,
          productId: op.productId,
          isActive: true,
          kind: 'video'
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, kind: true }
      });
      if (row) {
        resolved.push({
          productMediaId: row.id,
          kind: 'video',
          caption: resolved.length === 0 ? caption : undefined
        });
        break;
      }
    }
    return resolved;
  }

  let imageBudget = MAX_OUTBOUND_IMAGES_PER_TURN;
  for (const op of mediaOps) {
    if (imageBudget <= 0) break;
    const kindFilter = op.kind === 'video' ? 'video' : 'image';
    if (kindFilter === 'video') continue;

    const rows = await prisma.productMedia.findMany({
      where: {
        vendorId,
        productId: op.productId,
        isActive: true,
        kind: 'image'
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: imageBudget,
      select: { id: true, kind: true }
    });

    for (const row of rows) {
      resolved.push({
        productMediaId: row.id,
        kind: 'image',
        caption: resolved.length === 0 ? caption : undefined
      });
      imageBudget -= 1;
      if (imageBudget <= 0) break;
    }
  }

  if (resolved.length > 0) return resolved;

  // kind null / image requested but only videos exist — send one video (PM6).
  for (const op of mediaOps) {
    if (op.kind === 'image') continue;
    const row = await prisma.productMedia.findFirst({
      where: {
        vendorId,
        productId: op.productId,
        isActive: true,
        kind: 'video'
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, kind: true }
    });
    if (row) {
      return [{ productMediaId: row.id, kind: 'video', caption }];
    }
  }

  return [];
}
