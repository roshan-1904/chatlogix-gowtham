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
  
  // Track the latest message ID and timestamp for polling
  const latestMessageIdRef = useRef<string | null>(null);
  const latestMessageTimestampRef = useRef<Date | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

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
            // Update latest message refs when messages are loaded
            if (updated.length > 0 && !append) {
              const latest = updated[updated.length - 1];
              latestMessageIdRef.current = latest.id;
              latestMessageTimestampRef.current = new Date(latest.timestamp);
            }
            return updated;
          });
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
            // Update latest message refs
            if (updated.length > 0) {
              const latest = updated[updated.length - 1];
              latestMessageIdRef.current = latest.id;
              latestMessageTimestampRef.current = new Date(latest.timestamp);
            }
            return updated;
          });
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
            // Update latest message refs
            if (updated.length > 0) {
              const latest = updated[updated.length - 1];
              latestMessageIdRef.current = latest.id;
              latestMessageTimestampRef.current = new Date(latest.timestamp);
            }
            return updated;
          });
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

  // Poll for new messages
  const checkForNewMessages = useCallback(async () => {
    if (!conversationId || !latestMessageIdRef.current || isPollingRef.current) return;

    isPollingRef.current = true;
    try {
      // Fetch only the latest message to check if there are new ones
      const response = await apiClient.get<MessagesResponse | { messages: Message[] } | Message[]>(
        `/conversations/${conversationId}/messages?limit=1`
      );

      let latestMessage: Message | null = null;
      
      if (Array.isArray(response)) {
        latestMessage = response[response.length - 1] || null;
      } else if ('messages' in response && Array.isArray(response.messages)) {
        latestMessage = response.messages[response.messages.length - 1] || null;
      }

      if (latestMessage && latestMessage.id !== latestMessageIdRef.current) {
        // There are new messages - count how many
        const latestTimestamp = new Date(latestMessage.timestamp);
        const currentTimestamp = latestMessageTimestampRef.current;
        
        if (currentTimestamp && latestTimestamp > currentTimestamp) {
          // Fetch messages since the last known timestamp to count them
          try {
            const allResponse = await apiClient.get<MessagesResponse | { messages: Message[] } | Message[]>(
              `/conversations/${conversationId}/messages`
            );
            
            let allMessages: Message[] = [];
            if (Array.isArray(allResponse)) {
              allMessages = allResponse;
            } else if ('messages' in allResponse && Array.isArray(allResponse.messages)) {
              allMessages = allResponse.messages;
            }
            
            // Count messages newer than our last known timestamp
            const newMessages = allMessages.filter(
              (msg) => new Date(msg.timestamp) > currentTimestamp
            );
            
            setNewMessageCount(newMessages.length);
            setHasNewMessages(true);
          } catch (err) {
            // If counting fails, just indicate there are new messages
            setHasNewMessages(true);
            setNewMessageCount(1);
          }
        }
      }
    } catch (err) {
      // Silently fail - don't disrupt UX
      console.debug('Error checking for new messages:', err);
    } finally {
      isPollingRef.current = false;
    }
  }, [conversationId]);

  // Load new messages (append to end)
  const loadNewMessages = useCallback(async () => {
    if (!conversationId || isLoadingNew || !hasNewMessages) return;

    setIsLoadingNew(true);
    setHasNewMessages(false);
    setNewMessageCount(0);

    try {
      // Fetch all messages and filter for new ones
      const response = await apiClient.get<MessagesResponse | { messages: Message[] } | Message[]>(
        `/conversations/${conversationId}/messages`
      );

      let allMessages: Message[] = [];
      if (Array.isArray(response)) {
        allMessages = response;
      } else if ('messages' in response && Array.isArray(response.messages)) {
        allMessages = response.messages;
      }

      const currentLatestTimestamp = latestMessageTimestampRef.current;
      if (currentLatestTimestamp) {
        const newMessages = allMessages.filter(
          (msg) => new Date(msg.timestamp) > currentLatestTimestamp
        );

        if (newMessages.length > 0) {
          setMessages((prev) => {
            // Merge new messages, avoiding duplicates
            const existingIds = new Set(prev.map((m) => m.id));
            const uniqueNew = newMessages.filter((m) => !existingIds.has(m.id));
            const updated = [...prev, ...uniqueNew].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            // Update latest message refs
            if (updated.length > 0) {
              const latest = updated[updated.length - 1];
              latestMessageIdRef.current = latest.id;
              latestMessageTimestampRef.current = new Date(latest.timestamp);
            }
            
            return updated;
          });
        }
      } else {
        // If we don't have a timestamp, just refresh all messages
        await refresh();
      }
    } catch (err) {
      console.error('Error loading new messages:', err);
      setHasNewMessages(true); // Re-enable indicator on error
    } finally {
      setIsLoadingNew(false);
    }
  }, [conversationId, hasNewMessages, isLoadingNew, refresh]);

  // Set up polling interval
  useEffect(() => {
    if (!conversationId || !enablePolling || !latestMessageIdRef.current) {
      return;
    }

    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Set up polling
    pollingIntervalRef.current = setInterval(() => {
      checkForNewMessages();
    }, pollingInterval);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [conversationId, enablePolling, pollingInterval, checkForNewMessages]);

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
        if (conversationId && enablePolling && latestMessageIdRef.current && !pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(() => {
            checkForNewMessages();
          }, pollingInterval);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, enablePolling, pollingInterval, checkForNewMessages]);

  // Reset when conversation changes
  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setOldestMessageId(null);
    setError(null);
    setAiPaused(false);
    setHasNewMessages(false);
    setNewMessageCount(0);
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


