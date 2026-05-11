/**
 * Unit Tests for Data Validation Service
 * Tests for validateOrderConfirmation, validateExtractedData, and formatValidationErrors
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateOrderConfirmation, validateExtractedData, validateOrderCancellation, validateRepeatOrder, formatValidationErrors } from '../dataValidationService.js';
import { prisma } from '../../db/prisma.js';

// Mock prisma
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    customerInsights: {
      findUnique: vi.fn()
    },
    vendor: {
      findUnique: vi.fn()
    },
    product: {
      findMany: vi.fn()
    }
  }
}));

describe('validateOrderConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if order does not exist', async () => {
    const result = await validateOrderConfirmation(null, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'order' })
    );
  });

  it('should fail if order is not pending', async () => {
    const order = { status: 'confirmed', items: [] };
    const result = await validateOrderConfirmation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'orderStatus' })
    );
  });

  it('should fail if order has no items', async () => {
    const order = { status: 'pending', items: [] };
    (prisma.customerInsights.findUnique as any).mockResolvedValue({
      customerName: 'Test Customer',
      primaryDeliveryAddress: '123 Test Street'
    });
    
    const result = await validateOrderConfirmation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'orderItems' })
    );
  });

  it('should fail if customer name is missing', async () => {
    const order = { status: 'pending', items: [{ product: 'Test Product', quantity: 1 }] };
    (prisma.customerInsights.findUnique as any).mockResolvedValue({
      customerName: null,
      primaryDeliveryAddress: '123 Test Street'
    });
    
    const result = await validateOrderConfirmation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'customerName' })
    );
  });

  it('should fail if delivery address is missing', async () => {
    const order = { status: 'pending', items: [{ product: 'Test Product', quantity: 1 }] };
    (prisma.customerInsights.findUnique as any).mockResolvedValue({
      customerName: 'Test Customer',
      primaryDeliveryAddress: null,
      deliveryAddress: null
    });
    
    const result = await validateOrderConfirmation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'deliveryAddress' })
    );
  });

  it('should pass when delivery address is provided in supplemental data', async () => {
    const order = { status: 'pending', items: [{ product: 'Test Product', quantity: 1 }] };
    (prisma.customerInsights.findUnique as any).mockResolvedValue({
      customerName: 'Test Customer',
      primaryDeliveryAddress: null,
      deliveryAddress: null
    });
    
    const result = await validateOrderConfirmation(
      order,
      'customer-id',
      'vendor-id',
      { deliveryAddress: '123 Test Street, Test City 600001' }
    );
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should pass when customer name is provided in supplemental data', async () => {
    const order = {
      status: 'pending',
      items: [{ product: 'Test Product', quantity: 1 }],
      deliveryAddress: '123 Test Street, Test City 600001'
    };
    (prisma.customerInsights.findUnique as any).mockResolvedValue({
      customerName: null,
      primaryDeliveryAddress: null,
      deliveryAddress: null
    });
    
    const result = await validateOrderConfirmation(
      order,
      'customer-id',
      'vendor-id',
      { customerName: 'Murali' }
    );
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should pass if all validations pass', async () => {
    const order = { 
      status: 'pending', 
      items: [{ product: 'Test Product', quantity: 1 }],
      deliveryAddress: '123 Test Street, Test City'
    };
    (prisma.customerInsights.findUnique as any).mockResolvedValue({
      customerName: 'Test Customer',
      primaryDeliveryAddress: '123 Test Street'
    });
    
    const result = await validateOrderConfirmation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

describe('validateExtractedData - order_new', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if order items are empty', async () => {
    const extractedData = { orderItems: [] };
    (prisma.product.findMany as any).mockResolvedValue([]);
    
    const result = await validateExtractedData(
      extractedData,
      'vendor-id',
      'conversation-id',
      'order_new'
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'orderItems' })
    );
  });

  it('should fail if order total is below minimum', async () => {
    const extractedData = { 
      orderItems: [{ product: 'Test Product', quantity: 1, price: 100 }],
      totalAmount: 50
    };
    (prisma.product.findMany as any).mockResolvedValue([]);
    (prisma.vendor.findUnique as any).mockResolvedValue({
      minimumOrderValue: 200
    });
    
    const result = await validateExtractedData(
      extractedData,
      'vendor-id',
      'conversation-id',
      'order_new'
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'totalAmount' })
    );
  });
});

describe('formatValidationErrors', () => {
  it('should format errors correctly', () => {
    const errors = [
      { field: 'customerName', error: 'Customer name is required', severity: 'error' as const },
      { field: 'deliveryAddress', error: 'Delivery address is required', severity: 'error' as const }
    ];
    
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('I need your name');
    expect(formatted).toContain('I need your delivery address');
  });

  it('should filter out warnings', () => {
    const errors = [
      { field: 'customerName', error: 'Customer name is required', severity: 'error' as const },
      { field: 'totalAmount', error: 'Price mismatch', severity: 'warning' as const }
    ];
    
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('I need your name');
    expect(formatted).not.toContain('Price mismatch');
  });
});

describe('validateOrderCancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if order does not exist', async () => {
    const result = await validateOrderCancellation(null, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'order' })
    );
  });

  it('should fail if order does not belong to customer', async () => {
    const order = { 
      status: 'pending', 
      customerId: 'different-customer-id',
      vendorId: 'vendor-id'
    };
    const result = await validateOrderCancellation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'order' })
    );
  });

  it('should fail if order is not cancellable', async () => {
    const order = { 
      status: 'delivered', 
      customerId: 'customer-id',
      vendorId: 'vendor-id'
    };
    const result = await validateOrderCancellation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'orderStatus' })
    );
  });

  it('should fail if order is already cancelled', async () => {
    const order = { 
      status: 'cancelled', 
      customerId: 'customer-id',
      vendorId: 'vendor-id'
    };
    const result = await validateOrderCancellation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'orderStatus' })
    );
  });

  it('should pass if order is pending and belongs to customer', async () => {
    const order = { 
      status: 'pending', 
      customerId: 'customer-id',
      vendorId: 'vendor-id'
    };
    const result = await validateOrderCancellation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should pass if order is confirmed and belongs to customer', async () => {
    const order = { 
      status: 'confirmed', 
      customerId: 'customer-id',
      vendorId: 'vendor-id'
    };
    const result = await validateOrderCancellation(order, 'customer-id', 'vendor-id');
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

describe('validateRepeatOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if previous order does not exist', async () => {
    const products: any[] = [];
    const result = await validateRepeatOrder(null, products, 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'previousOrder' })
    );
  });

  it('should fail if previous order has no items', async () => {
    const previousOrder = { items: [] };
    const products: any[] = [];
    const result = await validateRepeatOrder(previousOrder, products, 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'orderItems' })
    );
  });

  it('should fail if products are no longer available', async () => {
    const previousOrder = { 
      items: [{ product: 'Old Product', quantity: 2 }]
    };
    const products: any[] = []; // Empty catalog
    const result = await validateRepeatOrder(previousOrder, products, 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'orderItems' && e.error.includes('no longer available'))).toBe(true);
  });

  it('should fail if products are out of stock', async () => {
    const previousOrder = { 
      items: [{ product: 'Test Product', quantity: 2 }]
    };
    const products = [{ 
      name: 'Test Product', 
      inStock: false 
    }];
    const result = await validateRepeatOrder(previousOrder, products, 'vendor-id');
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'orderItems' && e.error.includes('out of stock'))).toBe(true);
  });

  it('should pass if all products are available and in stock', async () => {
    const previousOrder = { 
      items: [{ product: 'Test Product', quantity: 2 }]
    };
    const products = [{ 
      name: 'Test Product', 
      inStock: true,
      keywords: []
    }];
    const result = await validateRepeatOrder(previousOrder, products, 'vendor-id');
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});


