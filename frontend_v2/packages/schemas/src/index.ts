// Zod Schemas
// Validation schemas for auth, products, orders, templates

import { z } from 'zod';

export { z };

// Auth schemas
export const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).optional(),
});

export const registerSchema = z.object({
  phone: z.string().min(10).max(15),
  businessName: z.string().min(2).max(100),
});

// Product schemas
export const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sku: z.string().min(1).max(100),
  price: z.number().min(0),
  stock: z.number().int().min(0).default(0),
  status: z.enum(['active', 'inactive']).default('active'),
});

// Order schemas
export const orderSchema = z.object({
  customerPhone: z.string().min(10).max(15),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().min(1),
      price: z.number().min(0),
    })
  ),
  total: z.number().min(0),
});

// Template schemas
export const templateSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  content: z.string().min(1).max(1000),
  variables: z.array(z.string()).optional(),
});

