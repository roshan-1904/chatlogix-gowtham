import express from 'express';
import { prisma } from '../db/prisma.js';
import { requireRole } from '../middleware/authorize.js';
import { logger } from '../logger.js';
import { z } from 'zod';

export const productsRouter = express.Router();

// Validation schemas
const VariantSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  attributes: z.record(z.string().max(100)).optional(),
  sku: z.string().max(80).optional(),
  unit: z.string().min(1).max(20),
  baseQuantity: z.number().positive().max(1000000),
  price: z.number().int().positive().max(999999999), // In paise
  isDivisible: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

const ProductCreateSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().trim().max(64).transform(s => s.toUpperCase()).optional(),
  description: z.string().max(2000).optional(),
  keywords: z.array(z.string().min(1).max(50)).max(20).default([]),
  baseUnit: z.string().min(1).max(20),
  baseQuantity: z.number().positive().max(1000000),
  basePrice: z.number().int().positive().max(999999999), // In paise
  isDivisible: z.boolean().default(false),
  minOrderQuantity: z.number().positive().optional(),
  maxOrderQuantity: z.number().positive().optional(),
  stockQuantity: z.number().nonnegative().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).max(50).default([]),
  variants: z.array(VariantSchema).optional(),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().optional().default(true),
  inStock: z.boolean().optional().default(true)
});

// GET /api/products - List products for vendor with filtering and pagination
// Query parameters: ?category={cat}&isActive={true|false}&search={query}&inStock={true|false}&page={page}&pageSize={size}
productsRouter.get('/', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId || req.query.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID required' });
    }
    
    // Ensure vendor can only access their own products (unless admin)
    if (!req.user?.roles?.includes('admin') && req.user?.vendorId !== vendorId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Build where clause with filters
    const where: any = { vendorId };
    
    // Filter by category
    if (req.query.category) {
      where.category = req.query.category as string;
    }
    
    // Filter by active status
    if (req.query.isActive !== undefined) {
      where.isActive = req.query.isActive === 'true';
    }
    
    // Filter by stock status
    if (req.query.inStock !== undefined) {
      where.inStock = req.query.inStock === 'true';
    }
    
    // Search filter (name, description, keywords)
    if (req.query.search) {
      const searchTerm = (req.query.search as string).toLowerCase();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { keywords: { has: searchTerm } }
      ];
    }

    // Pagination
    const page = Number.parseInt(req.query.page as string) || 1;
    const pageSize = Number.parseInt(req.query.pageSize as string) || 20;
    const skip = (page - 1) * pageSize;

    // Get total count for pagination (handled in try-catch below)

    // Get products with pagination
    // Note: Product model needs to be added to Prisma schema
    // For now, return empty array if Product model doesn't exist
    let products: any[] = [];
    let total = 0;
    
    try {
      products = await prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' }
      });
      total = await prisma.product.count({ where });
    } catch (error: any) {
      // If Product model doesn't exist, return empty result
      if (error?.message?.includes('product') || error?.code === 'P2001') {
        logger.warn({ error }, 'Product model not found in database schema');
        return res.json({
          products: [],
          total: 0,
          page,
          pageSize
        });
      }
      throw error;
    }
    
    // Return paginated response
    res.json({
      products,
      total,
      page,
      pageSize
    });
  } catch (error) {
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to fetch products');
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/categories - Get all unique categories for vendor
productsRouter.get('/categories', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId || req.query.vendorId;
    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID required' });
    }
    
    // Ensure vendor can only access their own categories (unless admin)
    if (!req.user?.roles?.includes('admin') && req.user?.vendorId !== vendorId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
      // Get all products for this vendor and extract unique categories
      const products = await prisma.product.findMany({
        where: { vendorId },
        select: { category: true }
      });
      
      // Extract unique categories and filter out null/undefined
      const uniqueCategories = new Set<string>();
      products.forEach(p => {
        if (p.category) {
          uniqueCategories.add(p.category);
        }
      });
      
      const categories = Array.from(uniqueCategories).sort((a, b) => a.localeCompare(b));
      
      res.json({ categories });
    } catch (error: any) {
      // If Product model doesn't exist, return empty array
      if (error?.message?.includes('product') || error?.code === 'P2001') {
        logger.warn({ error }, 'Product model not found in database schema');
        return res.json({ categories: [] });
      }
      throw error;
    }
  } catch (error) {
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to fetch categories');
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/products/:id - Get single product
productsRouter.get('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        ...(vendorId && !req.user?.roles?.includes('admin') ? { vendorId } : {})
      }
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    logger.error({ error, productId: req.params.id }, 'Failed to fetch product');
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products - Create product
productsRouter.post('/', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }
    
    // Validate input
    const validated = ProductCreateSchema.parse(req.body);
    
    // Business logic validation
    if (validated.minOrderQuantity && validated.maxOrderQuantity) {
      if (validated.minOrderQuantity > validated.maxOrderQuantity) {
        return res.status(400).json({ 
          error: 'Minimum order quantity cannot exceed maximum order quantity' 
        });
      }
    }
    
    // Check for duplicate product name
    const existing = await prisma.product.findUnique({
      where: {
        vendorId_name: {
          vendorId,
          name: validated.name
        }
      }
    });
    
    if (existing) {
      return res.status(409).json({ error: 'Product with this name already exists' });
    }
    
    // Create product
    const product = await prisma.product.create({
      data: {
        ...validated,
        vendorId
      }
    });
    
    res.status(201).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to create product');
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PUT /api/products/:id - Update product
productsRouter.put('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    // Check if product exists and user has access
    const existing = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        ...(vendorId && !req.user?.roles?.includes('admin') ? { vendorId } : {})
      }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Validate input (partial schema for updates)
    const updateSchema = ProductCreateSchema.partial();
    const validated = updateSchema.parse(req.body);
    
    // Business logic validation
    if (validated.minOrderQuantity && validated.maxOrderQuantity) {
      if (validated.minOrderQuantity > validated.maxOrderQuantity) {
        return res.status(400).json({ 
          error: 'Minimum order quantity cannot exceed maximum order quantity' 
        });
      }
    }
    
    // Check for duplicate name if name is being updated
    if (validated.name && validated.name !== existing.name) {
      const duplicate = await prisma.product.findUnique({
        where: {
          vendorId_name: {
            vendorId: existing.vendorId,
            name: validated.name
          }
        }
      });
      
      if (duplicate) {
        return res.status(409).json({ error: 'Product with this name already exists' });
      }
    }
    
    // Update product
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: validated
    });
    
    res.json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    
    logger.error({ error, productId: req.params.id }, 'Failed to update product');
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/products/:id - Delete product (soft delete by setting isActive=false)
productsRouter.delete('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    // Check if product exists and user has access
    const existing = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        ...(vendorId && !req.user?.roles?.includes('admin') ? { vendorId } : {})
      }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Soft delete by setting isActive to false
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    
    res.json(product);
  } catch (error) {
    logger.error({ error, productId: req.params.id }, 'Failed to delete product');
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// GET /api/products/:id/stats - Get product statistics
productsRouter.get('/:id/stats', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    
    // Check if product exists and user has access
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        ...(vendorId && !req.user?.roles?.includes('admin') ? { vendorId } : {})
      }
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get order statistics for this product
    // Since Order.items is stored as JSON, we need to query orders and parse items
    const orders = await prisma.order.findMany({
      where: {
        vendorId: product.vendorId
      },
      select: {
        id: true,
        items: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Parse items from JSON and filter by product name
    interface OrderItem {
      product: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }
    
    const matchingOrderItems: Array<{ item: OrderItem; orderCreatedAt: Date }> = [];
    
    for (const order of orders) {
      try {
        const items = order.items as unknown as OrderItem[] | OrderItem;
        const itemsArray = Array.isArray(items) ? items : [items];
        
        for (const item of itemsArray) {
          // Match by product name (since items store product name, not ID)
          if (item.product === product.name) {
            matchingOrderItems.push({
              item,
              orderCreatedAt: order.createdAt
            });
          }
        }
      } catch (error) {
        // Skip orders with invalid items JSON
        logger.warn({ error, orderId: order.id }, 'Failed to parse order items');
      }
    }
    
    const totalOrders = new Set(matchingOrderItems.map(oi => oi.orderCreatedAt)).size;
    const totalRevenue = matchingOrderItems.reduce((sum: number, { item }) => {
      return sum + (item.totalPrice || 0);
    }, 0);
    const totalQuantity = matchingOrderItems.reduce((sum: number, { item }) => {
      return sum + (item.quantity || 0);
    }, 0);
    const averageOrderQuantity = totalOrders > 0 ? totalQuantity / totalOrders : 0;
    
    const sortedOrderItems = matchingOrderItems.length > 0 
      ? [...matchingOrderItems].sort((a, b) => b.orderCreatedAt.getTime() - a.orderCreatedAt.getTime())
      : [];
    const lastOrderedAt = sortedOrderItems.length > 0 ? sortedOrderItems[0].orderCreatedAt : null;
    
    // Convert revenue from paise to rupees
    res.json({
      totalOrders,
      totalRevenue: totalRevenue / 100, // Convert to rupees
      averageOrderQuantity,
      lastOrderedAt: lastOrderedAt?.toISOString() || null
    });
  } catch (error) {
    logger.error({ error, productId: req.params.id }, 'Failed to fetch product stats');
    res.status(500).json({ error: 'Failed to fetch product statistics' });
  }
});

// POST /api/products/bulk - Bulk operations
productsRouter.post('/bulk', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const { action, ids } = req.body;
    
    // Validate input
    if (!action || !['activate', 'deactivate', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be: activate, deactivate, or delete' });
    }
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Product IDs array is required' });
    }
    
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 products per bulk operation' });
    }
    
    // Find products that belong to the vendor
    const where: any = {
      id: { in: ids }
    };
    
    if (vendorId && !req.user?.roles?.includes('admin')) {
      where.vendorId = vendorId;
    }
    
    const products = await prisma.product.findMany({ where });
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'No products found' });
    }
    
    // Perform bulk operation
    let updateData: any = {};
    if (action === 'activate') {
      updateData.isActive = true;
    } else if (action === 'deactivate') {
      updateData.isActive = false;
    } else if (action === 'delete') {
      updateData.isActive = false; // Soft delete
    }
    
    const result = await prisma.product.updateMany({
      where: {
        id: { in: products.map(p => p.id) }
      },
      data: updateData
    });
    
    res.json({
      success: true,
      updated: result.count,
      errors: []
    });
  } catch (error) {
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to perform bulk operation');
    res.status(500).json({ error: 'Failed to perform bulk operation' });
  }
});

