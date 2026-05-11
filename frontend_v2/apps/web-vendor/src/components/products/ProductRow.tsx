/**
 * Product row component for table view
 */

import { useState } from 'react';
import { Badge } from '@chatlogix/ui';
import { formatAmountWithSymbol } from '../../utils/currency';
import type { Product } from '../../types/product';

interface ProductRowProps {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
}

export function ProductRow({
  product,
  onEdit,
  onDelete,
  onToggleStatus,
  isSelected = false,
  onSelect,
}: ProductRowProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <tr className={`border-b border-gray-200 hover:bg-gray-50 ${isSelected ? 'bg-gray-100' : ''}`}>
      {onSelect && (
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect?.(e.target.checked)}
            className="rounded"
          />
        </td>
      )}
      
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-10 h-10 rounded object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400">
              📦
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={onEdit}
              className="font-medium text-gray-900 hover:text-primary-500 text-left"
            >
              {product.name}
            </button>
            {product.description && (
              <p className="text-sm text-gray-500 line-clamp-1">{product.description}</p>
            )}
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-sm text-gray-700">
        {product.category || '-'}
      </td>

      <td className="px-4 py-3">
        <span className="font-semibold text-gray-900">
          {formatAmountWithSymbol(product.basePrice * 100)}
        </span>
        <span className="text-xs text-gray-500 ml-1">
          / {product.baseQuantity} {product.baseUnit}
        </span>
      </td>

      <td className="px-4 py-3">
        {product.stockQuantity !== undefined ? (
          <span className={`text-sm ${product.inStock ? 'text-green-600' : 'text-red-600'}`}>
            {product.stockQuantity} {product.baseUnit}
          </span>
        ) : (
          <span className="text-sm text-gray-400">Not tracked</span>
        )}
      </td>

      <td className="px-4 py-3">
        <Badge variant={product.isActive ? 'success' : 'secondary'}>
          {product.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </td>

      <td className="px-4 py-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowActions(!showActions)}
            className="text-gray-400 hover:text-gray-600 px-2"
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
      </td>
    </tr>
  );
}

