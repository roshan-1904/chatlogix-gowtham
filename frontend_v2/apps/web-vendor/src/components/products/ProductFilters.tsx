/**
 * Product filters component
 */

import { useState, useEffect } from 'react';
import { Input, Button } from '@chatlogix/ui';
import { debounce } from '@chatlogix/utils';
import type { ProductFilters } from '../../types/product';

interface ProductFiltersProps {
  readonly filters: ProductFilters;
  readonly onChange: (filters: ProductFilters) => void;
  readonly categories?: string[];
}

const SEARCH_DEBOUNCE_MS = 300;

export function ProductFilters({
  filters,
  onChange,
  categories = [],
}: ProductFiltersProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState(filters.search || '');

  const debouncedSearch = debounce((query: string) => {
    onChange({ ...filters, search: query || undefined, page: 1 });
  }, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    debouncedSearch(localSearchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearchQuery]);

  const handleFilterChange = (key: keyof ProductFilters, value: any) => {
    onChange({ ...filters, [key]: value, page: 1 });
  };

  const clearFilters = () => {
    const cleared: ProductFilters = {
      page: 1,
      pageSize: filters.pageSize || 20,
    };
    onChange(cleared);
    setLocalSearchQuery('');
  };

  const hasActiveFilters = !!(
    filters.category ||
    filters.isActive !== undefined ||
    filters.search ||
    filters.inStock !== undefined
  );

  return (
    <div className="space-y-4 p-4 bg-white border border-gray-200 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search */}
        <div className="md:col-span-2">
          <label htmlFor="search-input" className="block text-xs text-gray-600 mb-1">Search</label>
          <Input
            id="search-input"
            type="text"
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            placeholder="Search by name, description, keywords..."
            className="w-full"
          />
        </div>

        {/* Category */}
        {categories.length > 0 && (
          <div>
            <label htmlFor="category-select" className="block text-xs text-gray-600 mb-1">Category</label>
            <select
              id="category-select"
              value={filters.category || ''}
              onChange={(e) => handleFilterChange('category', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="" className="text-gray-900">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat} className="text-gray-900">
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status */}
        <div>
          <label htmlFor="status-select" className="block text-xs text-gray-600 mb-1">Status</label>
          <select
            id="status-select"
            value={(() => {
              if (filters.isActive === undefined) return 'all';
              return filters.isActive ? 'active' : 'inactive';
            })()}
            onChange={(e) => {
              const value = e.target.value;
              const isActiveValue = value === 'all' ? undefined : value === 'active';
              handleFilterChange('isActive', isActiveValue);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all" className="text-gray-900">All</option>
            <option value="active" className="text-gray-900">Active</option>
            <option value="inactive" className="text-gray-900">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stock Status */}
      <div className="flex items-center gap-4">
        <label htmlFor="in-stock-checkbox" className="flex items-center gap-2 text-sm text-gray-700">
          <input
            id="in-stock-checkbox"
            type="checkbox"
            checked={filters.inStock === true}
            onChange={(e) => handleFilterChange('inStock', e.target.checked ? true : undefined)}
            className="rounded"
          />{' '}
          In Stock Only
        </label>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
          >
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  );
}

