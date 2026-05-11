/**
 * Product list component with table and grid views
 */

import { Button } from '@chatlogix/ui';
import { ProductCard } from './ProductCard';
import { ProductRow } from './ProductRow';
import type { Product } from '../../types/product';

interface ProductListProps {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, isActive: boolean) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  viewMode?: 'table' | 'grid';
  onViewModeChange?: (mode: 'table' | 'grid') => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function ProductList({
  products,
  total,
  page,
  pageSize,
  loading = false,
  onEdit,
  onDelete,
  onToggleStatus,
  onPageChange,
  onPageSizeChange,
  viewMode = 'table',
  onViewModeChange,
  selectedIds = [],
  onSelectionChange,
}: ProductListProps) {
  const totalPages = Math.ceil(total / pageSize);

  const handleSelectAll = (checked: boolean) => {
    if (onSelectionChange) {
      onSelectionChange(checked ? products.map(p => p.id) : []);
    }
  };

  const handleSelect = (id: string, selected: boolean) => {
    if (onSelectionChange) {
      if (selected) {
        onSelectionChange([...selectedIds, id]);
      } else {
        onSelectionChange(selectedIds.filter(i => i !== id));
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-200 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📦</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
        <p className="text-gray-500 mb-4">Get started by creating your first product</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      {onViewModeChange && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div className="text-xs sm:text-sm text-gray-600">
            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} products
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={viewMode === 'table' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onViewModeChange('table')}
              className="text-xs sm:text-sm"
            >
              Table
            </Button>
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onViewModeChange('grid')}
              className="text-xs sm:text-sm"
            >
              Grid
            </Button>
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                {onSelectionChange && (
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === products.length && products.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded w-3 h-3 sm:w-4 sm:h-4"
                    />
                  </th>
                )}
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Category</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Stock</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  onEdit={() => onEdit(product.id)}
                  onDelete={() => onDelete(product.id)}
                  onToggleStatus={() => onToggleStatus(product.id, !product.isActive)}
                  isSelected={selectedIds.includes(product.id)}
                  onSelect={(selected) => handleSelect(product.id, selected)}
                />
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => onEdit(product.id)}
              onDelete={() => onDelete(product.id)}
              onToggleStatus={() => onToggleStatus(product.id, !product.isActive)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 border-t border-gray-200 pt-3 sm:pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-gray-600">Items per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number.parseInt(e.target.value, 10))}
              className="px-2 py-1 border border-gray-300 rounded text-xs sm:text-sm text-gray-900 bg-white"
            >
              <option value={10} className="text-gray-900">10</option>
              <option value={20} className="text-gray-900">20</option>
              <option value={50} className="text-gray-900">50</option>
              <option value={100} className="text-gray-900">100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="text-xs sm:text-sm"
            >
              Previous
            </Button>
            
            <span className="text-xs sm:text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="text-xs sm:text-sm"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

