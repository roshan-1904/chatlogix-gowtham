import { useCallback, useEffect, useState, useRef } from 'react';
import { apiClient } from '../../../lib/api';
import type { Message, MessagesResponse } from '../types';

interface UseMessagesOptions {
  conversationId?: string | null;
  pageSize?: number;
  enablePolling?: boolean;
  pollingInterval?: number;
}

interface UseMessagesResult {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  oldestMessageId: string | null;
  aiPaused: boolean;
  setAiPaused: (paused: boolean) => void;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  hasNewMessages: boolean;
  loadNewMessages: () => Promise<void>;
  newMessageCount: number;
  isLoadingNew: boolean;
}

function readMessagesPayload(
  response: MessagesResponse | { messages: Message[] } | Message[],
): Message[] {
  if (Array.isArray(response)) return response;
  if ('messages' in response && Array.isArray(response.messages)) return response.messages;
  return [];
}

/**
 * Message loading with support for cursor-based pagination.
 *
 * Works with both the new paginated messages API and the current
 * "return all messages" shape.
 */
export function useMessages({
  conversationId,
  pageSize = 25,
  enablePolling = true,
  pollingInterval = 10000, // 10 seconds
}: UseMessagesOptions): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<string | null>(null);
  const [aiPaused, setAiPaused] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isLoadingNew, setIsLoadingNew] = useState(false);
  const [pollReady, setPollReady] = useState(false);
  
  // Track the latest message ID and timestamp for polling
  const latestMessageIdRef = useRef<string | null>(null);
  const latestMessageTimestampRef = useRef<Date | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Mirrors `messages` for the polling interval below, which intentionally
  // doesn't depend on `messages` directly (that would tear down and rebuild
  // the interval on every message update).
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const isRefreshingMediaRef = useRef(false);

  // Media is fetched async on the backend (can take anywhere from seconds to
  // ~20+ minutes) — a message already loaded into state with media still
  // `pending` never otherwise gets refreshed, so it's stuck on a placeholder
  // until the vendor reloads the whole conversation. This patches the
  // `media`/`status`/`content` fields of already-loaded messages once their
  // media fetch completes, piggybacking on the existing polling tick.
  // `content` matters for audio: the Whisper transcript overwrites it
  // server-side in the same pass that flips media.state to 'ready', so it
  // must be refreshed here too or the transcript never appears without a
  // full reload.
  const refreshPendingMedia = useCallback(async () => {
    if (!conversationId || isRefreshingMediaRef.current) return;

    const pendingIds = messagesRef.current
      .filter((m) => m.media && !['ready', 'failed', 'expired'].includes(m.media.state))
      .map((m) => m.id);
    if (pendingIds.length === 0) return;

    isRefreshingMediaRef.current = true;
    try {
      const results = await Promise.all(
        pendingIds.map((id) =>
          apiClient.get<Message>(`/messages/${id}`).catch(() => null),
        ),
      );

      const updatesById = new Map<string, Message>();
      for (const fresh of results) {
        if (fresh) updatesById.set(fresh.id, fresh);
      }
      if (updatesById.size === 0) return;

      setMessages((prev) =>
        prev.map((m) => {
          const fresh = updatesById.get(m.id);
          if (!fresh) return m;
          return { ...m, media: fresh.media, status: fresh.status, content: fresh.content };
        }),
      );
    } catch (err) {
      console.debug('Error refreshing pending media:', err);
    } finally {
      isRefreshingMediaRef.current = false;
    }
  }, [conversationId]);

  const fetchPage = useCallback(
    async (beforeMessageId?: string | null, append = false) => {
      if (!conversationId) return;

      const isInitialLoad = !append;
      setError(null);
      if (isInitialLoad) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('limit', String(pageSize));
        if (beforeMessageId) {
          queryParams.set('beforeMessageId', beforeMessageId);
        }

        const path = `/conversations/${conversationId}/messages?${queryParams.toString()}`;

        const response = await apiClient.get<
          MessagesResponse | { messages: Message[]; aiPaused?: boolean } | Message[]
        >(path);

        // New API shape: cursor-based pagination (may also include aiPaused)
        if (
          !Array.isArray(response) &&
          'messages' in (response as MessagesResponse) &&
          'hasMore' in (response as MessagesResponse)
        ) {
          const paginated = response as MessagesResponse;
          const nextMessages = paginated.messages ?? [];

          setHasMore(Boolean(paginated.hasMore));
          setOldestMessageId(paginated.oldestMessageId ?? null);
          setAiPaused(Boolean(paginated.aiPaused));

          setMessages((prev) => {
            const updated = append ? [...nextMessages, ...prev] : nextMessages;
            if (updated.length > 0 && !append) {
              const latest = updated[updated.length - 1];
              latestMessageIdRef.current = latest.id;
              latestMessageTimestampRef.current = new Date(latest.timestamp);
            }
            return updated;
          });
          if (!append) setPollReady(true);
          return;
        }

        // Existing API: wrapper object (with optional aiPaused)
        if (
          !Array.isArray(response) &&
          'messages' in (response as { messages: Message[] })
        ) {
          const wrapper = response as { messages: Message[]; aiPaused?: boolean };
          const all = wrapper.messages ?? [];
          const limited = all.slice(-pageSize);
          setAiPaused(Boolean(wrapper.aiPaused));
          setMessages(() => {
            const updated = limited;
            if (updated.length > 0) {
              const latest = updated[updated.length - 1];
              latestMessageIdRef.current = latest.id;
              latestMessageTimestampRef.current = new Date(latest.timestamp);
            }
            return updated;
          });
          setPollReady(true);
          setHasMore(all.length > limited.length);
          setOldestMessageId(limited[0]?.id ?? null);
          return;
        }

        // Existing API: plain array of messages
        if (Array.isArray(response)) {
          const all = response;
          const limited = all.slice(-pageSize);
          setMessages(() => {
            const updated = limited;
            if (updated.length > 0) {
              const latest = updated[updated.length - 1];
              latestMessageIdRef.current = latest.id;
              latestMessageTimestampRef.current = new Date(latest.timestamp);
            }
            return updated;
          });
          setPollReady(true);
          setHasMore(all.length > limited.length);
          setOldestMessageId(limited[0]?.id ?? null);
          return;
        }
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load messages';
        setError(errorMessage);
        console.error('Error loading messages:', err);
        setMessages([]);
        setHasMore(false);
        setOldestMessageId(null);
        setAiPaused(false);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [conversationId, pageSize],
  );

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    await fetchPage(null, false);
  }, [fetchPage, conversationId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasMore || isLoading || isLoadingMore) return;
    await fetchPage(oldestMessageId, true);
  }, [conversationId, hasMore, isLoading, isLoadingMore, fetchPage, oldestMessageId]);

  const ingestLatest = useCallback(async (): Promise<number> => {
    if (!conversationId) return 0;

    const response = await apiClient.get<MessagesResponse | { messages: Message[] } | Message[]>(
      `/conversations/${conversationId}/messages?limit=${pageSize}`,
    );
    const latestPage = readMessagesPayload(response);
    if (latestPage.length === 0) return 0;

    let added = 0;
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const uniqueNew = latestPage.filter((m) => !existingIds.has(m.id));
      added = uniqueNew.length;
      if (uniqueNew.length === 0) return prev;
      return [...prev, ...uniqueNew].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    });

    const newest = latestPage[latestPage.length - 1];
    latestMessageIdRef.current = newest.id;
    latestMessageTimestampRef.current = new Date(newest.timestamp);
    return added;
  }, [conversationId, pageSize]);

  const checkForNewMessages = useCallback(async () => {
    if (!conversationId || !latestMessageIdRef.current || isPollingRef.current) return;

    isPollingRef.current = true;
    try {
      const response = await apiClient.get<MessagesResponse | { messages: Message[] } | Message[]>(
        `/conversations/${conversationId}/messages?limit=1`,
      );

      const page = readMessagesPayload(response);
      const latestMessage = page.length > 0 ? page[page.length - 1] : null;
      if (latestMessage && latestMessage.id !== latestMessageIdRef.current) {
        await ingestLatest();
      }
    } catch (err) {
      console.debug('Error checking for new messages:', err);
    } finally {
      isPollingRef.current = false;
    }
  }, [conversationId, ingestLatest]);

  const loadNewMessages = useCallback(async () => {
    if (!conversationId || isLoadingNew) return;

    setIsLoadingNew(true);
    setHasNewMessages(false);
    setNewMessageCount(0);

    try {
      await ingestLatest();
    } catch (err) {
      console.error('Error loading new messages:', err);
      setHasNewMessages(true);
    } finally {
      setIsLoadingNew(false);
    }
  }, [conversationId, isLoadingNew, ingestLatest]);

  // Set up polling interval
  useEffect(() => {
    if (!conversationId || !enablePolling || !pollReady) {
      return;
    }

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Set up polling
    pollingIntervalRef.current = setInterval(() => {
      checkForNewMessages();
      refreshPendingMedia();
    }, pollingInterval);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [conversationId, enablePolling, pollingInterval, pollReady, checkForNewMessages, refreshPendingMedia]);

  // Pause polling when tab is not visible (using Page Visibility API)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - pause polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else {
        // Tab is visible - resume polling
        if (conversationId && enablePolling && pollReady && !pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(() => {
            checkForNewMessages();
            refreshPendingMedia();
          }, pollingInterval);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, enablePolling, pollingInterval, pollReady, checkForNewMessages, refreshPendingMedia]);

  // Reset when conversation changes
  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setOldestMessageId(null);
    setError(null);
    setAiPaused(false);
    setHasNewMessages(false);
    setNewMessageCount(0);
    setPollReady(false);
    latestMessageIdRef.current = null;
    latestMessageTimestampRef.current = null;
    isPollingRef.current = false;

    // Clear polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (conversationId) {
      fetchPage(null, false);
    }
  }, [conversationId, fetchPage]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    oldestMessageId,
    aiPaused,
    setAiPaused,
    refresh,
    loadOlder,
    hasNewMessages,
    loadNewMessages,
    newMessageCount,
    isLoadingNew,
  };
}


