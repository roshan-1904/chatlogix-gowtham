import express from 'express';
import { prisma } from '../db/prisma.js';
import { requireRole } from '../middleware/authorize.js';
import { logger } from '../logger.js';
import { z } from 'zod';
import { invalidateCompactCatalog } from '../conversation/prefetch.js';
import { normalizeProductEnglish } from '../utils/englishStorage.js';
import { listProductMedia } from '../services/productMediaStorage.js';

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
  inStock: z.boolean().optional().default(true),
  vendorId: z.string().optional()
});

export class TenantIsolationError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'TenantIsolationError';
    this.statusCode = statusCode;
  }
}

/**
 * Resolves the target vendorId for product and catalog routes.
 *
 * Rules (docs/launch/02-catalog-tenant-isolation.md):
 * - Admin: use req.query.vendorId or req.body.vendorId when it is a non-empty string.
 *   Ignore req.user.vendorId. If no shop id is provided, respond 400.
 * - Vendor: use req.user.vendorId only. If a query or body vendorId is present
 *   and different, respond 403.
 */
export function resolveProductVendorId(req: express.Request): string {
  const user = req.user as { vendorId?: string; roles?: string[] } | undefined;
  const isAdmin = Boolean(user?.roles?.includes('admin'));

  const requestedVendorId =
    (typeof req.query?.vendorId === 'string' && req.query.vendorId.trim() ? req.query.vendorId.trim() : undefined) ||
    (typeof req.body?.vendorId === 'string' && req.body.vendorId.trim() ? req.body.vendorId.trim() : undefined);

  if (isAdmin) {
    if (requestedVendorId) {
      return requestedVendorId;
    }
    throw new TenantIsolationError(400, 'Vendor ID required');
  }

  const tokenVendorId = user?.vendorId;
  if (!tokenVendorId) {
    throw new TenantIsolationError(403, 'Vendor context required');
  }

  if (requestedVendorId && requestedVendorId !== tokenVendorId) {
    throw new TenantIsolationError(403, 'Unauthorized');
  }

  return tokenVendorId;
}

// GET /api/products - List products for vendor with filtering and pagination
// Query parameters: ?category={cat}&isActive={true|false}&search={query}&inStock={true|false}&page={page}&pageSize={size}
productsRouter.get('/', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveProductVendorId(req);

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
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to fetch products');
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/categories - Get all unique categories for vendor
productsRouter.get('/categories', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveProductVendorId(req);

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
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to fetch categories');
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/products/:id - Get single product
productsRouter.get('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveProductVendorId(req);
    
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        vendorId
      }
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // The edit form renders the media gallery from this payload, so it does
    // not have to round-trip to /media on open (docs/PRODUCT_MEDIA.md §10).
    const media = await listProductMedia(product.id);

    res.json({ ...product, media });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error({ error, productId: req.params.id }, 'Failed to fetch product');
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products - Create product
productsRouter.post('/', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveProductVendorId(req);
    
    // Validate input
    const validated = await normalizeProductEnglish(ProductCreateSchema.parse(req.body));
    
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
    
    const { vendorId: _ignored, ...productData } = validated;

    // Create product
    const product = await prisma.product.create({
      data: {
        ...productData,
        vendorId
      }
    });

    // conversation processor's compact catalog cache (spec §24) must not
    // serve a stale product list after a write.
    await invalidateCompactCatalog(vendorId);

    res.status(201).json(product);
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
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
    const vendorId = resolveProductVendorId(req);

    // Check if product exists and user has access
    const existing = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        vendorId
      }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Validate input (partial schema for updates)
    const updateSchema = ProductCreateSchema.partial();
    const validated = await normalizeProductEnglish(updateSchema.parse(req.body));
    
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
    
    const { vendorId: _ignored, ...productData } = validated;

    // Update product
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: productData
    });

    await invalidateCompactCatalog(existing.vendorId);

    res.json(product);
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
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
    const vendorId = resolveProductVendorId(req);

    // Check if product exists and user has access
    const existing = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        vendorId
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

    await invalidateCompactCatalog(existing.vendorId);

    res.json(product);
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error({ error, productId: req.params.id }, 'Failed to delete product');
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// GET /api/products/:id/stats - Get product statistics
productsRouter.get('/:id/stats', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveProductVendorId(req);
    
    // Check if product exists and user has access
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        vendorId
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
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error({ error, productId: req.params.id }, 'Failed to fetch product stats');
    res.status(500).json({ error: 'Failed to fetch product statistics' });
  }
});

// POST /api/products/bulk - Bulk operations
productsRouter.post('/bulk', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveProductVendorId(req);

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
    
    // Find products that belong to the resolved vendor
    const products = await prisma.product.findMany({
      where: {
        id: { in: ids },
        vendorId
      }
    });
    
    if (products.length === 0 || products.length !== ids.length) {
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
        id: { in: products.map(p => p.id) },
        vendorId
      },
      data: updateData
    });

    await invalidateCompactCatalog(vendorId);

    res.json({
      success: true,
      updated: result.count,
      errors: []
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to perform bulk operation');
    res.status(500).json({ error: 'Failed to perform bulk operation' });
  }
});

