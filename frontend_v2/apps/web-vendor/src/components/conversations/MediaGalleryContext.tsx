import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Message } from './types';
import { MediaGallery } from './bubbles/shared/MediaGallery';

export interface GalleryItem {
  readonly messageId: string;
  readonly mediaUrl: string;
  readonly mimeType?: string | null;
  readonly filename?: string | null;
  readonly caption?: string | null;
  readonly type: 'image' | 'video';
  readonly timestamp: string;
}

interface MediaGalleryContextValue {
  readonly items: GalleryItem[];
  readonly activeIndex: number;
  readonly openGallery: (messageId: string) => void;
  readonly close: () => void;
  readonly next: () => void;
  readonly prev: () => void;
}

const MediaGalleryContext = createContext<MediaGalleryContextValue | null>(null);

interface MediaGalleryProviderProps {
  readonly messages: Message[];
  readonly children: ReactNode;
}

/**
 * Tracks every ready image/video in the loaded conversation so any bubble
 * can open a single shared, WhatsApp-style viewer positioned at itself,
 * with prev/next paging across the rest of the conversation's media.
 */
export function MediaGalleryProvider({ messages, children }: MediaGalleryProviderProps) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  const items = useMemo<GalleryItem[]>(() => {
    return messages
      .filter(
        (m) =>
          (m.type === 'image' || m.type === 'video') &&
          m.media?.state === 'ready' &&
          Boolean(m.media.mediaUrl),
      )
      .map((m) => ({
        messageId: m.id,
        mediaUrl: m.media!.mediaUrl as string,
        mimeType: m.media!.mimeType,
        filename: m.media!.filename,
        caption: m.media!.caption ?? m.content,
        type: m.type === 'video' ? 'video' : 'image',
        timestamp: m.timestamp,
      }));
  }, [messages]);

  const activeIndex = activeMessageId
    ? items.findIndex((item) => item.messageId === activeMessageId)
    : -1;

  const openGallery = useCallback((messageId: string) => {
    setActiveMessageId(messageId);
  }, []);

  const close = useCallback(() => setActiveMessageId(null), []);

  const next = useCallback(() => {
    setActiveMessageId((current) => {
      const idx = items.findIndex((item) => item.messageId === current);
      if (idx === -1 || idx >= items.length - 1) return current;
      return items[idx + 1].messageId;
    });
  }, [items]);

  const prev = useCallback(() => {
    setActiveMessageId((current) => {
      const idx = items.findIndex((item) => item.messageId === current);
      if (idx <= 0) return current;
      return items[idx - 1].messageId;
    });
  }, [items]);

  const value = useMemo<MediaGalleryContextValue>(
    () => ({ items, activeIndex, openGallery, close, next, prev }),
    [items, activeIndex, openGallery, close, next, prev],
  );

  return (
    <MediaGalleryContext.Provider value={value}>
      {children}
      <MediaGallery />
    </MediaGalleryContext.Provider>
  );
}

export function useMediaGallery(): MediaGalleryContextValue {
  const ctx = useContext(MediaGalleryContext);
  if (!ctx) {
    throw new Error('useMediaGallery must be used within a MediaGalleryProvider');
  }
  return ctx;
}
