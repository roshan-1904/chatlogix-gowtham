/**
 * Edit product page
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ProductForm } from '../components/products/ProductForm';
import { getProduct, updateProduct } from '../lib/products';
import type { Product, ProductFormData } from '../types/product';

export function ProductEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadProduct();
    }
  }, [id]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const data = await getProduct(id!);
      setProduct(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load product';
      setError(message);
      console.error('Failed to load product:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: ProductFormData) => {
    if (!id) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Saving product...');

    try {
      await updateProduct(id, data);
      toast.success('Product updated successfully!', { id: toastId });
      setTimeout(() => {
        navigate('/catalog');
      }, 500);
    } catch (err: unknown) {
      let message = 'Failed to update product. Please try again.';

      if (err && typeof err === 'object' && 'response' in err) {
        const errorData = (err as { response?: { data?: { error?: string } } }).response?.data;
        if (errorData?.error) {
          message = errorData.error;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }

      toast.error(message, { id: toastId });
      console.error('Failed to update product:', err);
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/catalog');
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 sm:h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-48 sm:h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 sm:p-4 lg:p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-red-700">{error}</p>
          <button
            onClick={() => navigate('/catalog')}
            className="mt-3 sm:mt-4 text-xs sm:text-sm text-red-600 hover:text-red-800"
          >
            ← Back to Products
          </button>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-3 sm:p-4 lg:p-6">
        <p className="text-xs sm:text-sm text-gray-500">Product not found</p>
      </div>
    );
  }

  return (
    <div className="p-1 ">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Edit Product</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">{product.name}</p>
      </div>

      <ProductForm
        product={product}
        mode="edit"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isSubmitting}
        onEnhanceSaved={loadProduct}
      />
    </div>
  );
}
