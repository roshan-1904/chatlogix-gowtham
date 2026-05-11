import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';
import type {
  Conversation,
  ConversationsResponse,
} from '../types';
import { useDebounce } from './useDebounce';
import type { ConversationFilters } from '../ConversationList';

interface UseConversationsOptions {
  vendorId?: string;
  pageSize?: number;
  filters?: ConversationFilters;
}

interface UseConversationsResult {
  conversations: Conversation[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  total: number | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * Conversations data + pagination + search.
 *
 * Supports both the new paginated API shape and the current
 * array-only response as a graceful fallback.
 */
export function useConversations({
  vendorId,
  pageSize = 20,
  filters,
}: UseConversationsOptions): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const debouncedSearch = useDebounce(searchQuery, 300);

  const fetchPage = useCallback(
    async (requestedPage: number, append: boolean) => {
      if (!vendorId) {
        setError('No vendor ID found');
        return;
      }

      const isFirstPage = requestedPage === 1 && !append;
      setError(null);
      if (isFirstPage) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(requestedPage));
        queryParams.set('limit', String(pageSize));
        queryParams.set('sort', 'updatedAt:desc');

        const basePath = debouncedSearch
          ? `/vendors/${vendorId}/conversations/search`
          : `/vendors/${vendorId}/conversations`;

        if (debouncedSearch) {
          queryParams.set('q', debouncedSearch);
        }

        // Add filter parameters
        if (filters) {
          if (filters.aiPauseStatus !== 'all') {
            queryParams.set('aiPaused', filters.aiPauseStatus === 'paused' ? 'true' : 'false');
          }
          if (filters.hasOrder !== 'all') {
            queryParams.set('hasOrder', filters.hasOrder === 'yes' ? 'true' : 'false');
          }
          if (filters.customerType !== 'all') {
            queryParams.set('customerType', filters.customerType);
          }
        }

        const path = `${basePath}?${queryParams.toString()}`;

        const response = await apiClient.get<ConversationsResponse | Conversation[]>(path);
        // Dev-time logging to verify backend shape while rolling out pagination
        // eslint-disable-next-line no-console
        console.debug('useConversations response', { path, response });

        // Apply client-side filtering if backend doesn't support filters
        const applyFilters = (conversations: Conversation[]): Conversation[] => {
          return conversations.filter((conversation) => {
            // AI Pause Status filter
            if (filters && filters.aiPauseStatus !== 'all') {
              const isPaused = conversation.aiPaused === true;
              if (filters.aiPauseStatus === 'paused' && !isPaused) return false;
              if (filters.aiPauseStatus === 'active' && isPaused) return false;
            }

            // Has Order filter
            if (filters && filters.hasOrder !== 'all') {
              const hasOrder = (conversation.orderCount ?? 0) > 0;
              if (filters.hasOrder === 'yes' && !hasOrder) return false;
              if (filters.hasOrder === 'no' && hasOrder) return false;
            }

            // Customer Type filter
            if (filters && filters.customerType !== 'all') {
              const isRegular = (conversation.orderCount ?? 0) > 0;
              if (filters.customerType === 'regular' && !isRegular) return false;
              if (filters.customerType === 'new' && isRegular) return false;
            }

            return true;
          });
        };

        // Fallback: backend still returns an array of conversations
        if (Array.isArray(response)) {
          let all = response as Conversation[];

          // Client-side search fallback by name or phone when server search is not available
          if (debouncedSearch) {
            const q = debouncedSearch.toLowerCase();
            all = all.filter((conv) => {
              const name = conv.customerName?.toLowerCase() || '';
              const phone = conv.customer.phone.toLowerCase();
              return name.includes(q) || phone.includes(q);
            });
          }

          // Apply client-side filters
          all = applyFilters(all);

          // Sort by minutesSinceLastMessage (ascending - most recent first)
          // This ensures consistent ordering matching the Dashboard widget
          all.sort((a, b) => {
            const aMinutes = a.minutesSinceLastMessage ?? null;
            const bMinutes = b.minutesSinceLastMessage ?? null;
            
            if (aMinutes === null && bMinutes === null) {
              return 0;
            }
            if (aMinutes === null) return 1; // a goes to end
            if (bMinutes === null) return -1; // b goes to end
            
            return aMinutes - bMinutes;
          });

          const limited = all.slice(0, pageSize);
          setConversations(limited);
          setHasMore(all.length > limited.length);
          setTotal(all.length);
          setPage(1);
          return;
        }

        const nextConversations = response.conversations ?? [];
        
        // Apply client-side filters to paginated response
        const filteredConversations = applyFilters(nextConversations);
        
        setTotal(typeof response.total === 'number' ? response.total : null);
        setHasMore(Boolean(response.hasMore));
        setPage(response.page ?? requestedPage);

        // Sort by minutesSinceLastMessage (ascending - most recent first)
        // This ensures consistent ordering matching the Dashboard widget
        const sortedConversations = [...filteredConversations].sort((a, b) => {
          // Handle null/undefined values - put conversations without messages at the end
          const aMinutes = a.minutesSinceLastMessage ?? null;
          const bMinutes = b.minutesSinceLastMessage ?? null;
          
          if (aMinutes === null && bMinutes === null) {
            return 0;
          }
          if (aMinutes === null) return 1; // a goes to end
          if (bMinutes === null) return -1; // b goes to end
          
          // Sort by minutesSinceLastMessage ascending (smaller = more recent = first)
          return aMinutes - bMinutes;
        });

        setConversations((prev) =>
          append ? [...prev, ...sortedConversations] : sortedConversations,
        );
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load conversations';
        setError(errorMessage);
        console.error('Error loading conversations:', err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [vendorId, pageSize, debouncedSearch, filters],
  );

  const refresh = useCallback(async () => {
    await fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    await fetchPage(page + 1, true);
  }, [fetchPage, page, isLoading, isLoadingMore, hasMore]);

  // Initial + vendor / search / filter changes
  useEffect(() => {
    if (!vendorId) return;
    // Reset to page 1 when filters change
    setPage(1);
    fetchPage(1, false);
  }, [vendorId, fetchPage, debouncedSearch, filters?.aiPauseStatus, filters?.hasOrder, filters?.customerType]);

  return {
    conversations,
    isLoading,
    isLoadingMore,
    error,
    page,
    hasMore,
    total,
    searchQuery,
    setSearchQuery,
    refresh,
    loadMore,
  };
}


