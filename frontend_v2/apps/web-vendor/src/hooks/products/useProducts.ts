/**
 * Hook for fetching and managing products list with pagination and filters
 */

import { useState, useEffect, useCallback } from 'react';
import { getProducts, deleteProduct, bulkUpdateProducts } from '../../lib/products';
import type { Product, ProductFilters, BulkOperationResult } from '../../types/product';

interface UseProductsOptions {
  initialFilters?: ProductFilters;
  autoFetch?: boolean;
}

interface UseProductsReturn {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  filters: ProductFilters;
  setFilters: (filters: ProductFilters | ((prev: ProductFilters) => ProductFilters)) => void;
  refetch: () => Promise<void>;
  deleteProductById: (id: string) => Promise<void>;
  bulkUpdate: (action: 'activate' | 'deactivate' | 'delete', ids: string[]) => Promise<BulkOperationResult>;
}

export function useProducts(options: UseProductsOptions = {}): UseProductsReturn {
  const { initialFilters = {}, autoFetch = true } = options;
  
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilters.page || 1);
  const [pageSize, setPageSize] = useState(initialFilters.pageSize || 20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<ProductFilters>({
    ...initialFilters,
    page,
    pageSize,
  });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getProducts(filters);
      setProducts(result.products);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch products';
      setError(errorMessage);
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (autoFetch) {
      fetchProducts();
    }
  }, [fetchProducts, autoFetch]);

  const setFilters = useCallback((newFilters: ProductFilters | ((prev: ProductFilters) => ProductFilters)) => {
    setFiltersState((prev) => {
      const updated = typeof newFilters === 'function' ? newFilters(prev) : newFilters;
      // Reset to page 1 when filters change (except page/pageSize)
      return {
        ...updated,
        page: updated.page || 1,
        pageSize: updated.pageSize || 20,
      };
    });
  }, []);

  const deleteProductById = useCallback(async (id: string) => {
    try {
      await deleteProduct(id);
      await fetchProducts();
      // Refetch after deletion
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete product';
      throw new Error(errorMessage);
    }
  }, [fetchProducts]);

  const bulkUpdate = useCallback(async (
    action: 'activate' | 'deactivate' | 'delete',
    ids: string[]
  ): Promise<BulkOperationResult> => {
    try {
      const result = await bulkUpdateProducts(action, ids);
      // Refetch after bulk update
      await fetchProducts();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to perform bulk operation';
      throw new Error(errorMessage);
    }
  }, [fetchProducts]);

  return {
    products,
    total,
    page,
    pageSize,
    loading,
    error,
    filters,
    setFilters,
    refetch: fetchProducts,
    deleteProductById,
    bulkUpdate,
  };
}
