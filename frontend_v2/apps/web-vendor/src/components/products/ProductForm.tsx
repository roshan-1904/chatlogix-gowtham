/**
 * Product form component with all sections
 */

import toast from 'react-hot-toast';
import { Button, Input } from '@chatlogix/ui';
import { useProductForm } from '../../hooks/products/useProductForm';
import { VariantManager } from './VariantManager';
import { KeywordsInput } from './KeywordsInput';
import { PriceCalculator } from './PriceCalculator';
import type { Product, ProductFormData } from '../../types/product';
import { UNIT_OPTIONS } from '../../lib/productUnits';

interface ProductFormProps {
  product?: Product;
  onSubmit: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  mode: 'create' | 'edit';
  isLoading?: boolean;
}

function generateSuggestions(name: string, description?: string): string[] {
  const suggestions: string[] = [];
  if (name) {
    name.toLowerCase().split(/\s+/).forEach(word => {
      if (word.length > 2 && !suggestions.includes(word)) {
        suggestions.push(word);
      }
    });
  }
  if (description) {
    description.toLowerCase().split(/\s+/).forEach(word => {
      if (word.length > 3 && !suggestions.includes(word)) {
        suggestions.push(word);
      }
    });
  }
  return suggestions.slice(0, 10);
}

export function ProductForm({
  product,
  onSubmit,
  onCancel,
  mode,
  isLoading = false,
}: ProductFormProps) {
  const {
    formData,
    updateField,
    touchedFields,
    setTouchedField,
    fieldErrors,
    validateForm,
  } = useProductForm({ product });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      // Mark all fields as touched to show errors
      Object.keys(formData).forEach(key => setTouchedField(key));
      // Show toast error for validation failures
      const errorMessages = Object.values(fieldErrors).filter(Boolean);
      if (errorMessages.length > 0) {
        toast.error(`Please fix the following errors: ${errorMessages.join(', ')}`);
      } else {
        toast.error('Please fill in all required fields');
      }
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Form submission error:', error);
      // Error toast is handled in the parent component (ProductEdit/ProductCreate)
    }
  };

  const suggestions = generateSuggestions(formData.name, formData.description);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6">
      {/* Left Column - Main Form */}
      <div className="flex-1 space-y-6 min-w-0">
        {/* Basic Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Basic Information <span className="text-red-500">*</span>
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  updateField('name', e.target.value);
                  setTouchedField('name');
                }}
                onBlur={() => setTouchedField('name')}
                placeholder="e.g., Rose Concentrate"
                error={touchedFields.has('name') ? fieldErrors.name : undefined}
                className="w-full"
                maxLength={255}
              />
              <p className="mt-1 text-xs text-gray-500">Enter a clear, descriptive name for your product</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe your product..."
                rows={4}
                maxLength={2000}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500">Optional: Help customers understand your product</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <Input
                type="text"
                value={formData.category || ''}
                onChange={(e) => updateField('category', e.target.value)}
                placeholder="e.g., Beverages, Food, etc."
                className="w-full"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <Input
                type="url"
                value={formData.imageUrl || ''}
                onChange={(e) => updateField('imageUrl', e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full"
              />
            </div>
          </div>
        </div>

      {/* Pricing & Units */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Pricing & Units <span className="text-red-500">*</span>
        </h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base Unit <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.baseUnit}
                onChange={(e) => {
                  updateField('baseUnit', e.target.value);
                  setTouchedField('baseUnit');
                }}
                onBlur={() => setTouchedField('baseUnit')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="" className="text-gray-500">Select unit</option>
                {UNIT_OPTIONS.map(unit => (
                  <option key={unit} value={unit} className="text-gray-900">{unit}</option>
                ))}
              </select>
              {touchedFields.has('baseUnit') && fieldErrors.baseUnit && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.baseUnit}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">e.g., kg, piece, ml, bottle</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base Quantity <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                value={formData.baseQuantity}
                onChange={(e) => {
                  updateField('baseQuantity', parseFloat(e.target.value) || 0);
                  setTouchedField('baseQuantity');
                }}
                onBlur={() => setTouchedField('baseQuantity')}
                min={0.001}
                max={1000000}
                step={0.001}
                error={touchedFields.has('baseQuantity') ? fieldErrors.baseQuantity : undefined}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">Quantity for base price</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base Price (₹) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                value={formData.basePrice || ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? 0 : Number.parseFloat(e.target.value);
                  updateField('basePrice', Number.isNaN(value) ? 0 : value);
                  setTouchedField('basePrice');
                }}
                onBlur={() => setTouchedField('basePrice')}
                min={0.01}
                step={0.01}
                error={touchedFields.has('basePrice') ? fieldErrors.basePrice : undefined}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">Price for base quantity (in rupees)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDivisible"
              checked={formData.isDivisible}
              onChange={(e) => updateField('isDivisible', e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isDivisible" className="text-sm text-gray-700">
              Allow fractional quantities
            </label>
          </div>
          <p className="text-xs text-gray-500 ml-6">Customers can order 0.5kg, 2.5 pieces, etc.</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Order Quantity</label>
              <Input
                type="number"
                value={formData.minOrderQuantity || ''}
                onChange={(e) => updateField('minOrderQuantity', e.target.value ? parseFloat(e.target.value) : undefined)}
                min={0.001}
                step={0.001}
                error={touchedFields.has('minOrderQuantity') ? fieldErrors.minOrderQuantity : undefined}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">Minimum quantity customers must order</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Order Quantity</label>
              <Input
                type="number"
                value={formData.maxOrderQuantity || ''}
                onChange={(e) => updateField('maxOrderQuantity', e.target.value ? parseFloat(e.target.value) : undefined)}
                min={0.001}
                step={0.001}
                error={touchedFields.has('maxOrderQuantity') ? fieldErrors.maxOrderQuantity : undefined}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">Maximum quantity per order</p>
            </div>
          </div>

          {formData.baseUnit && formData.basePrice > 0 && (
            <PriceCalculator
              basePrice={formData.basePrice}
              baseQuantity={formData.baseQuantity}
              baseUnit={formData.baseUnit}
              isDivisible={formData.isDivisible}
              minOrderQuantity={formData.minOrderQuantity}
              maxOrderQuantity={formData.maxOrderQuantity}
            />
          )}
        </div>
      </div>

      {/* Variants */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Variants (Optional)</h3>
        <VariantManager
          variants={formData.variants || []}
          onChange={(variants) => updateField('variants', variants)}
          error={fieldErrors.variants}
        />
      </div>

      </div>

      {/* Right Sidebar - Secondary Sections */}
      <div className="w-full lg:w-80 space-y-6 flex-shrink-0">
        <div className="lg:sticky lg:top-6 space-y-6">
          {/* Product Status */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => updateField('isActive', e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Product is Active
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Active products are visible to customers. Inactive products are hidden from the catalog.
              </p>
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tags</h3>
            <KeywordsInput
              keywords={formData.tags || []}
              onChange={(tags) => updateField('tags', tags)}
              suggestions={suggestions}
              maxKeywords={20}
              maxLength={50}
              error={touchedFields.has('tags') ? fieldErrors.tags : undefined}
            />
            <p className="mt-2 text-xs text-gray-500">
              Add tags to categorize your product (e.g., "diwali", "combo", "traditional")
            </p>
          </div>

          {/* Inventory */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory</h3>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="trackStock"
                  checked={formData.stockQuantity !== null && formData.stockQuantity !== undefined}
                  onChange={(e) => updateField('stockQuantity', e.target.checked ? 0 : undefined)}
                  className="rounded"
                />
                <label htmlFor="trackStock" className="text-sm text-gray-700">
                  Track Stock Quantity
                </label>
              </div>
              <p className="text-xs text-gray-500">Enable to manage inventory levels</p>

              {formData.stockQuantity !== null && formData.stockQuantity !== undefined && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
                    <Input
                      type="number"
                      value={formData.stockQuantity}
                      onChange={(e) => updateField('stockQuantity', parseFloat(e.target.value) || 0)}
                      min={0}
                      step={0.001}
                      error={touchedFields.has('stockQuantity') ? fieldErrors.stockQuantity : undefined}
                      className="w-full"
                    />
                    <p className="mt-1 text-xs text-gray-500">Current available quantity</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="inStock"
                      checked={formData.inStock}
                      onChange={(e) => updateField('inStock', e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="inStock" className="text-sm text-gray-700">
                      In Stock
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">Mark as out of stock to prevent orders</p>
                </>
              )}
            </div>
          </div>

          {/* AI Keywords */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Keywords</h3>
            
            <KeywordsInput
              keywords={formData.keywords || []}
              onChange={(keywords) => updateField('keywords', keywords)}
              suggestions={suggestions}
              maxKeywords={20}
              maxLength={50}
              error={touchedFields.has('keywords') ? fieldErrors.keywords : undefined}
            />
            <p className="mt-2 text-xs text-gray-500">
              Add words customers might use when ordering. This helps AI match products correctly.
              Examples: "rose", "juice", "beverage", "drink"
            </p>
          </div>

          {/* Form Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                disabled={isLoading}
                isLoading={isLoading}
                className="w-full"
              >
                {mode === 'create' ? 'Create Product' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={isLoading}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

