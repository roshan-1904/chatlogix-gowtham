/**
 * Hook for managing product form state with validation
 */

import { useState, useCallback, SetStateAction } from 'react';
import type { ProductFormData, Product } from '../../types/product';

interface FieldErrors {
  [key: string]: string;
}

interface UseProductFormOptions {
  initialData?: Partial<ProductFormData>;
  product?: Product;
}

interface UseProductFormReturn {
  formData: ProductFormData;
  setFormData: (data: SetStateAction<ProductFormData>) => void;
  updateField: <K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) => void;
  touchedFields: Set<string>;
  setTouchedField: (field: string) => void;
  fieldErrors: FieldErrors;
  setFieldError: (field: string, error: string | null) => void;
  validateField: (field: keyof ProductFormData) => string | null;
  validateForm: () => boolean;
  reset: () => void;
}

const defaultFormData: ProductFormData = {
  name: '',
  description: '',
  category: '',
  imageUrl: '',
  tags: [],
  baseUnit: '',
  baseQuantity: 1,
  basePrice: 0,
  isDivisible: false,
  minOrderQuantity: undefined,
  maxOrderQuantity: undefined,
  variants: [],
  stockQuantity: undefined,
  inStock: true,
  keywords: [],
  isActive: true,
};

export function useProductForm(options: UseProductFormOptions = {}): UseProductFormReturn {
  const { initialData, product } = options;
  
  const initialFormData: ProductFormData = product ? {
    name: product.name,
    description: product.description || '',
    category: product.category || '',
    imageUrl: product.imageUrl || '',
    tags: product.tags || [],
    baseUnit: product.baseUnit,
    baseQuantity: product.baseQuantity,
    basePrice: product.basePrice,
    isDivisible: product.isDivisible,
    minOrderQuantity: product.minOrderQuantity,
    maxOrderQuantity: product.maxOrderQuantity,
    variants: product.variants || [],
    stockQuantity: product.stockQuantity,
    inStock: product.inStock,
    keywords: product.keywords || [],
    isActive: product.isActive,
  } : { ...defaultFormData, ...initialData };

  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const updateField = useCallback(<K extends keyof ProductFormData>(
    field: K,
    value: ProductFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is updated
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [fieldErrors]);

  const setTouchedField = useCallback((field: string) => {
    setTouchedFields((prev) => new Set(prev).add(field));
  }, []);

  const setFieldError = useCallback((field: string, error: string | null) => {
    setFieldErrors((prev) => {
      if (error === null) {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      }
      return { ...prev, [field]: error };
    });
  }, []);

  const validateField = useCallback((field: keyof ProductFormData): string | null => {
    const value = formData[field];

    switch (field) {
      case 'name':
        if (!value || (typeof value === 'string' && value.trim().length === 0)) {
          return 'Product name is required';
        }
        if (typeof value === 'string' && value.length > 255) {
          return 'Product name must be 255 characters or less';
        }
        if (typeof value === 'string' && /[<>]/.test(value)) {
          return 'Product name cannot contain < or >';
        }
        break;
      
      case 'basePrice':
        if (typeof value === 'number' && value <= 0) {
          return 'Base price must be greater than 0';
        }
        if (typeof value === 'number' && value > 9999999.99) {
          return 'Base price cannot exceed ₹9,999,999.99';
        }
        break;
      
      case 'baseQuantity':
        if (typeof value === 'number' && value <= 0) {
          return 'Base quantity must be greater than 0';
        }
        if (typeof value === 'number' && value > 1000000) {
          return 'Base quantity cannot exceed 1,000,000';
        }
        break;
      
      case 'minOrderQuantity':
        if (value !== undefined && typeof value === 'number') {
          if (value <= 0) {
            return 'Minimum order quantity must be greater than 0';
          }
          if (formData.maxOrderQuantity && value > formData.maxOrderQuantity) {
            return 'Minimum order quantity cannot exceed maximum order quantity';
          }
        }
        break;
      
      case 'maxOrderQuantity':
        if (value !== undefined && typeof value === 'number') {
          if (value <= 0) {
            return 'Maximum order quantity must be greater than 0';
          }
          if (formData.minOrderQuantity && value < formData.minOrderQuantity) {
            return 'Maximum order quantity cannot be less than minimum order quantity';
          }
        }
        break;
      
      case 'keywords':
        if (Array.isArray(value) && value.length > 20) {
          return 'Maximum 20 keywords allowed';
        }
        if (Array.isArray(value)) {
          for (const keyword of value) {
            if (typeof keyword === 'string' && keyword.length > 50) {
              return 'Each keyword must be 50 characters or less';
            }
          }
        }
        break;
      
      case 'stockQuantity':
        if (value !== undefined && value !== null && typeof value === 'number' && value < 0) {
          return 'Stock quantity cannot be negative';
        }
        break;
    }

    return null;
  }, [formData]);

  const validateForm = useCallback((): boolean => {
    const errors: FieldErrors = {};
    let isValid = true;

    // Validate all required fields
    const requiredFields: (keyof ProductFormData)[] = ['name', 'baseUnit', 'baseQuantity', 'basePrice'];
    
    for (const field of requiredFields) {
      const error = validateField(field);
      if (error) {
        errors[field] = error;
        isValid = false;
      }
    }

    // Validate optional fields that have values
    const optionalFields: (keyof ProductFormData)[] = [
      'minOrderQuantity',
      'maxOrderQuantity',
      'keywords',
      'stockQuantity',
    ];

    for (const field of optionalFields) {
      if (formData[field] !== undefined && formData[field] !== null && formData[field] !== '') {
        const error = validateField(field);
        if (error) {
          errors[field] = error;
          isValid = false;
        }
      }
    }

    // Validate variants
    if (formData.variants && formData.variants.length > 0) {
      for (let i = 0; i < formData.variants.length; i++) {
        const variant = formData.variants[i];
        if (!variant.unit || variant.price === undefined || variant.price === null || !variant.baseQuantity) {
          errors[`variants.${i}`] = 'Variant must have unit, price, and quantity';
          isValid = false;
        }
        // Note: We allow variants to have the same unit as base unit for quantity-based pricing
        // (e.g., 1 box at ₹499, 2 boxes at ₹950)
      }
    }

    setFieldErrors(errors);
    return isValid;
  }, [formData, validateField]);

  const reset = useCallback(() => {
    setFormData(initialFormData);
    setTouchedFields(new Set());
    setFieldErrors({});
  }, [initialFormData]);

  return {
    formData,
    setFormData,
    updateField,
    touchedFields,
    setTouchedField,
    fieldErrors,
    setFieldError,
    validateField,
    validateForm,
    reset,
  };
}

