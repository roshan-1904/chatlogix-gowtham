/**
 * Hook for fetching and managing the vendor's FAQ list
 */

import { useState, useEffect, useCallback } from 'react';
import { getFaqs, deleteFaq } from '../../lib/faqs';
import type { Faq } from '../../types/faq';

interface UseFaqsReturn {
  faqs: Faq[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteFaqById: (id: string) => Promise<void>;
}

export function useFaqs(): UseFaqsReturn {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getFaqs();
      setFaqs(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch FAQs';
      setError(errorMessage);
      console.error('Error fetching FAQs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const deleteFaqById = useCallback(
    async (id: string) => {
      try {
        await deleteFaq(id);
        await fetchFaqs();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete FAQ';
        throw new Error(errorMessage);
      }
    },
    [fetchFaqs]
  );

  return {
    faqs,
    loading,
    error,
    refetch: fetchFaqs,
    deleteFaqById,
  };
}
