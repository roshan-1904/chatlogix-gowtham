/**
 * Create product page
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ProductForm } from '../components/products/ProductForm';
import { createProduct } from '../lib/products';
import type { ProductFormData } from '../types/product';

export function ProductCreate() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: ProductFormData) => {
    setIsLoading(true);
    const toastId = toast.loading('Creating product...');
    
    try {
      const product = await createProduct({
        ...data,
        isActive: data.isActive ?? true,
      });
      toast.success('Product created successfully!', { id: toastId });
      // Small delay to show success message before navigation
      setTimeout(() => {
        navigate(`/catalog/${product.id}`);
      }, 500);
    } catch (error) {
      console.error('Failed to create product:', error);
      const message = error instanceof Error ? error.message : 'Failed to create product. Please try again.';
      toast.error(message, { id: toastId });
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/catalog');
  };

  return (
    <div className="p-1 ">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Create Product</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">Add a new product to your catalog</p>
      </div>

      <ProductForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isLoading}
      />
    </div>
  );
}
