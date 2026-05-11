/**
 * Product card component for grid view
 */

import { useState } from 'react';
import { Badge } from '@chatlogix/ui';
import { formatAmountWithSymbol } from '../../utils/currency';
import type { Product } from '../../types/product';

interface ProductCardProps {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

export function ProductCard({
  product,
  onEdit,
  onDelete,
  onToggleStatus,
}: ProductCardProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="aspect-square bg-gray-100 flex items-center justify-center">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-400 text-4xl">📦</div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-gray-900 line-clamp-2 flex-1">{product.name}</h3>
          <div className="relative ml-2">
            <button
              type="button"
              onClick={() => setShowActions(!showActions)}
              className="text-gray-400 hover:text-gray-600"
            >
              ⋮
            </button>
            {showActions && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  type="button"
                  onClick={() => {
                    onEdit();
                    setShowActions(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleStatus();
                    setShowActions(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {product.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setShowActions(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {product.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">{product.description}</p>
        )}

        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-semibold text-gray-900">
            {formatAmountWithSymbol(product.basePrice * 100)}
          </span>
          <Badge variant={product.isActive ? 'success' : 'secondary'}>
            {product.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{product.baseQuantity} {product.baseUnit}</span>
          {product.stockQuantity !== undefined && (
            <>
              <span>•</span>
              <span className={product.inStock ? 'text-green-600' : 'text-red-600'}>
                Stock: {product.stockQuantity}
              </span>
            </>
          )}
        </div>

        {product.variants && product.variants.length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            {product.variants.length} variant{product.variants.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

