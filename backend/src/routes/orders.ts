import express from 'express';
import { prisma } from '../db/prisma.js';
import { OrderService } from '../services/orderService.js';
import { WhatsAppTemplateService } from '../services/whatsappTemplateService.js';
import { logger } from '../logger.js';
import { DatabaseRetryService } from '../services/databaseRetryService.js';
import { 
  asyncHandlerWithContext, 
  createValidationError, 
  createDatabaseError, 
  ErrorType, 
  ErrorSeverity,
  CustomError
} from '../middleware/errorHandler.js';
import { requireRole, requireVendorAccess } from '../middleware/authorize.js';

// Helper function to parse DD/MM/YYYY date format
function parseDate(dateString: string): Date {
  // Check if it's in DD/MM/YYYY format
  if (dateString.includes('/') && dateString.split('/').length === 3) {
    const parts = dateString.split('/');
    if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
      // Convert DD/MM/YYYY to YYYY-MM-DD
      const isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      return new Date(isoDate);
    }
  }
  // Fallback to default Date parsing
  return new Date(dateString);
}

export const ordersRouter = express.Router();
const orderService = new OrderService();
const whatsappTemplateService = new WhatsAppTemplateService();

function ensureOrderAccess(req: any, vendorId: string) {
  const user = req.user;

  if (!user) {
    throw new CustomError(
      'Authentication required',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  if (user.roles.includes('admin')) {
    return;
  }

  if (user.roles.includes('vendor') && user.vendorId === vendorId) {
    return;
  }

  throw new CustomError(
    'You are not authorized to access this order',
    403,
    ErrorType.AUTHORIZATION,
    ErrorSeverity.MEDIUM,
    true,
    { vendorId, userVendorId: user.vendorId }
  );
}

// GET /api/orders - Get orders for a vendor
ordersRouter.get('/', requireVendorAccess(req => req.query.vendorId as string | undefined), asyncHandlerWithContext(async (req: any, res: any) => {
  const { vendorId, status } = req.query;
  
  if (!vendorId) {
    throw createValidationError('Vendor ID is required', 'vendorId', vendorId);
  }

  const orders = await orderService.getVendorOrders(vendorId as string, status as string);
  res.json(orders);
}, ErrorType.BUSINESS_LOGIC, ErrorSeverity.LOW));

// GET /api/orders/vendor/:vendorId/stats - Get order statistics for vendor
ordersRouter.get('/vendor/:vendorId/stats', requireVendorAccess(req => req.params.vendorId), asyncHandlerWithContext(async (req: any, res: any) => {
  const vendorId = req.params.vendorId;
  
  const stats = await DatabaseRetryService.withRetry(
    () => prisma.order.groupBy({
      by: ['status'],
      where: { vendorId },
      _count: { status: true },
      _sum: { totalAmount: true }
    }),
    'orders_stats_groupBy',
    { vendorId }
  );

  const totalOrders = await DatabaseRetryService.withRetry(
    () => prisma.order.count({
      where: { vendorId }
    }),
    'orders_stats_count',
    { vendorId }
  );

  const totalRevenue = await DatabaseRetryService.withRetry(
    () => prisma.order.aggregate({
      where: { 
        vendorId,
        status: { in: ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'] }
      },
      _sum: { totalAmount: true }
    }),
    'orders_stats_aggregate',
    { vendorId }
  );

  res.json({
    totalOrders,
    totalRevenue: totalRevenue._sum.totalAmount || 0,
    statusBreakdown: stats.map((stat: { status: any; _count: { status: any; }; _sum: { totalAmount: any; }; }) => ({
      status: stat.status,
      count: stat._count.status,
      revenue: stat._sum.totalAmount || 0
    }))
  });
}, ErrorType.DATABASE, ErrorSeverity.MEDIUM));

// PUT /api/orders/:id/notes - Update customer notes on an order
ordersRouter.put('/:id/notes', asyncHandlerWithContext(async (req: any, res: any) => {
  const orderId = req.params.id;
  const { customerNotes } = req.body as { customerNotes?: string };

  if (typeof customerNotes === 'undefined') {
    throw createValidationError('customerNotes is required', 'customerNotes', customerNotes);
  }

  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { vendorId: true }
  });

  if (!existingOrder) {
    throw createValidationError('Order not found', 'orderId', orderId);
  }

  ensureOrderAccess(req, existingOrder.vendorId);

  try {
    // Note: customerNotes field is commented out in schema
    // For now, we'll store it in specialRequests field instead
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { 
        specialRequests: customerNotes,
        updatedAt: new Date()
      },
      include: {
        vendor: { select: { businessName: true, aiBotName: true, phone: true } },
        customer: { select: { phone: true } },
      },
    });

    res.json(order);
  } catch (dbError: any) {
    logger.error({ error: dbError, orderId }, 'Error updating order notes');
    throw dbError;
  }
}, ErrorType.DATABASE, ErrorSeverity.MEDIUM));

// POST /api/orders/:id/payment-link - Generate payment link for order
// Note: This route must come before /:id to ensure proper matching
ordersRouter.post('/:id/payment-link', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { amount, customerPhone } = req.body;

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { vendorId: true }
    });

    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    ensureOrderAccess(req, existingOrder.vendorId);

    // TODO: Implement payment link generation
    // This is a placeholder - will be implemented when payment gateway is integrated
    res.status(501).json({ error: 'Not implemented' });
  } catch (error) {
    logger.error({ error }, 'Error generating payment link');
    res.status(500).json({ message: 'Failed to generate payment link' });
  }
});

// GET /api/orders/:id - Get order details
ordersRouter.get('/:id', asyncHandlerWithContext(async (req: any, res: any) => {
  const orderId = req.params.id;

  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { vendorId: true }
  });

  if (!existingOrder) {
    throw createValidationError('Order not found', 'orderId', orderId);
  }

  ensureOrderAccess(req, existingOrder.vendorId);

  const order = await orderService.getOrderDetails(orderId);
  
  if (!order) {
    throw createValidationError('Order not found', 'orderId', orderId);
  }
  
  res.json(order);
}, ErrorType.BUSINESS_LOGIC, ErrorSeverity.MEDIUM));

// PUT /api/orders/:id/status - Update order status
ordersRouter.put('/:id/status', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status, estimatedDelivery, cancellationReason } = req.body;
    
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { vendorId: true }
    });

    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    ensureOrderAccess(req, existingOrder.vendorId);

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const order = await orderService.updateOrderStatus(orderId, status, {
      estimatedDelivery: estimatedDelivery ? parseDate(estimatedDelivery) : undefined,
      cancellationReason
    });

    // Queue notification (async, fire and forget)
    whatsappTemplateService.sendOrderStatusUpdate(orderId, status)
      .then(result => {
        if (!result.success) {
          logger.warn({ orderId, status, error: result.error }, 'Order notification failed to queue');
        }
      })
      .catch(error => {
        logger.error({ orderId, status, error }, 'Order notification error');
      });

    res.json(order);
  } catch (error: any) {
    if (error.message?.includes('Invalid status transition')) {
      return res.status(400).json({ message: error.message });
    }
    logger.error({ error }, 'Error updating order status');
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

// POST /api/orders/:id/confirm - Confirm order
ordersRouter.post('/:id/confirm', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { estimatedDelivery } = req.body;

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { vendorId: true }
    });

    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    ensureOrderAccess(req, existingOrder.vendorId);

    const order = await orderService.updateOrderStatus(orderId, 'confirmed', {
      estimatedDelivery: estimatedDelivery ? parseDate(estimatedDelivery) : undefined
    });

    // Queue notification (async, fire and forget)
    whatsappTemplateService.sendOrderStatusUpdate(orderId, 'confirmed')
      .then(result => {
        if (!result.success) {
          logger.warn({ orderId, error: result.error }, 'Order confirmation notification failed to queue');
        }
      })
      .catch(error => {
        logger.error({ orderId, error }, 'Order confirmation notification error');
      });

    res.json(order);
  } catch (error) {
    logger.error({ error }, 'Error confirming order');
    res.status(500).json({ message: 'Failed to confirm order' });
  }
});

// POST /api/orders/:id/cancel - Cancel order
ordersRouter.post('/:id/cancel', async (req, res) => {
  try {
    const orderId = req.params.id;
    const reason = req.body.reason?.trim();

    if (!reason) {
      return res.status(400).json({ message: 'Cancellation reason is required' });
    }
    if (reason.length > 500) {
      return res.status(400).json({ message: 'Cancellation reason must be under 500 characters' });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { vendorId: true, status: true }
    });

    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    ensureOrderAccess(req, existingOrder.vendorId);

    if (['delivered', 'cancelled'].includes(existingOrder.status)) {
      return res.status(400).json({ message: `Cannot cancel order with status: ${existingOrder.status}` });
    }

    const order = await orderService.updateOrderStatus(orderId, 'cancelled', {
      cancellationReason: reason
    });

    // Queue notification (async, fire and forget)
    whatsappTemplateService.sendOrderStatusUpdate(orderId, 'cancelled')
      .then(result => {
        if (!result.success) {
          logger.warn({ orderId, error: result.error }, 'Order cancellation notification failed to queue');
        }
      })
      .catch(error => {
        logger.error({ orderId, error }, 'Order cancellation notification error');
      });

    res.json(order);
  } catch (error: any) {
    if (error.message?.includes('Invalid status transition')) {
      return res.status(400).json({ message: error.message });
    }
    logger.error({ error }, 'Error cancelling order');
    res.status(500).json({ message: 'Failed to cancel order' });
  }
});

// POST /api/orders/:id/notify - Send notification for order status
ordersRouter.post('/:id/notify', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { vendorId: true, status: true }
    });

    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    ensureOrderAccess(req, existingOrder.vendorId);

    const notificationStatus = status || existingOrder.status;
    
    // Queue notification
    const result = await whatsappTemplateService.sendOrderStatusUpdate(orderId, notificationStatus);

    if (result.success) {
      res.json({
        success: true,
        queued: result.queued,
        message: result.queued 
          ? 'Notification queued successfully' 
          : 'Notifications are disabled for this order'
      });
    } else {
      res.status(500).json({
        success: false,
        queued: false,
        error: result.error || 'Failed to queue notification'
      });
    }
  } catch (error) {
    logger.error({ error }, 'Error sending notification');
    res.status(500).json({ 
      success: false,
      error: 'Failed to send notification' 
    });
  }
});

// POST /api/orders/extract - Manually extract order from conversation
ordersRouter.post('/extract', requireVendorAccess(req => req.body?.vendorId as string | undefined), async (req, res) => {
  try {
    const { conversationId, vendorId } = req.body;
    
    if (!conversationId || !vendorId) {
      return res.status(400).json({ message: 'Conversation ID and Vendor ID are required' });
    }

    // Get conversation details
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Extract order information
    const extractedOrder = await orderService.extractOrderFromConversation(conversationId);
    
    if (!extractedOrder || extractedOrder.items.length === 0) {
      return res.status(400).json({ message: 'No order information found in conversation' });
    }

    // Check if order already exists
    const existingOrder = await prisma.order.findFirst({
      where: { 
        conversationId,
        status: { in: ['pending', 'confirmed', 'preparing', 'ready'] }
      }
    });

    if (existingOrder) {
      return res.status(400).json({ message: 'Order already exists for this conversation' });
    }

    // Create new order
    const order = await orderService.createOrder(
      vendorId,
      conversation.customerId,
      conversationId,
      extractedOrder
    );

    res.json(order);
  } catch (error) {
    logger.error({ error }, 'Error extracting order');
    res.status(500).json({ message: 'Failed to extract order' });
  }
});

// GET /api/customers/:customerId/orders - Get orders for a specific customer
ordersRouter.get('/customers/:customerId/orders', asyncHandlerWithContext(async (req: any, res: any) => {
  const customerId = req.params.customerId;
  const user = req.user;

  if (!user) {
    throw new CustomError(
      'Authentication required',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Get vendorId from user
  const vendorId = user.vendorId;
  if (!vendorId && !user.roles.includes('admin')) {
    throw new CustomError(
      'Vendor ID is required',
      400,
      ErrorType.VALIDATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Build where clause
  const where: any = { customerId };
  if (!user.roles.includes('admin')) {
    where.vendorId = vendorId;
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      conversation: {
        select: {
          id: true,
          status: true
        }
      }
    }
  });

  res.json(orders);
}, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM));