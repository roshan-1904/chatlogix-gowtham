import { useCallback, useEffect, useState } from 'react';
import { getCustomerQueries, getCustomerQuerySummary } from '../../lib/customerQueries';
import type { CustomerQueryListItem } from '../../types/customerQuery';

interface UseCustomerQueriesOptions {
  status?: string;
  category?: string;
  search?: string;
}

const summaryListeners = new Set<() => Promise<void>>();

/** Call after a mutation that can change the open-query count so the sidebar badge does not wait for the poll. */
export function notifyCustomerQueriesChanged(): void {
  summaryListeners.forEach((listener) => {
    void listener();
  });
}

interface UseCustomerQueriesReturn {
  queries: CustomerQueryListItem[];
  loading: boolean;
  error: string | null;
  total: number;
  refetch: () => Promise<void>;
}

export function useCustomerQueries(options: UseCustomerQueriesOptions = {}): UseCustomerQueriesReturn {
  const { status = 'open', category, search } = options;
  const [queries, setQueries] = useState<CustomerQueryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQueries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCustomerQueries({ status, category, search });
      setQueries(result.queries || []);
      setTotal(result.total || 0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch queries';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [status, category, search]);

  useEffect(() => {
    void fetchQueries();
  }, [fetchQueries]);

  return { queries, loading, error, total, refetch: fetchQueries };
}

export function useCustomerQuerySummary(): { openCount: number; refetch: () => Promise<void> } {
  const [openCount, setOpenCount] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const result = await getCustomerQuerySummary();
      setOpenCount(result.openCount ?? 0);
    } catch {
      setOpenCount(0);
    }
  }, []);

  useEffect(() => {
    void refetch();
    summaryListeners.add(refetch);
    const timer = window.setInterval(() => {
      void refetch();
    }, 60_000);
    return () => {
      summaryListeners.delete(refetch);
      window.clearInterval(timer);
    };
  }, [refetch]);

  return { openCount, refetch };
}
