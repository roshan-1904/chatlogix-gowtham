import { prisma } from '../db/prisma.js';
import { ConversationState, createEmptyConversationState } from '../types/conversationState.js';
import { logger } from '../logger.js';

export class ConversationStateService {
  public static async buildConversationState(
    conversationId: string,
    vendorId: string
  ): Promise<ConversationState> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 20,
          select: { content: true, senderType: true, timestamp: true }
        },
        orders: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { businessName: true, aiProducts: true, aiPreparationTimeMinutes: true }
    });

    const insights = await prisma.customerInsights.findUnique({
      where: { customerId_vendorId: { customerId: conversation.customerId, vendorId } }
    });

    const state = createEmptyConversationState({
      vendorId,
      vendorName: vendor?.businessName || '',
      conversationId,
      customerId: conversation.customerId,
      customerPhone: conversation.customer?.phone
    });

    // Fill customer from insights
    state.state.customer.basicDetails = insights?.basicDetails || '';
    state.state.customer.preferences = insights?.preferences || '';
    state.state.customer.communicationStyle = insights?.communicationStyle || '';
    state.state.customer.deliveryAddress = insights?.deliveryAddress || '';
    state.state.customer.deliveryInstructions = insights?.deliveryInstructions || '';
    state.state.customer.specialRequests = insights?.specialRequests || '';

    // Fill order from latest pending order if present
    const pendingOrder = conversation.orders?.[0];
    if (pendingOrder) {
      state.state.order.status = 'pending';
      try {
        // Parse items if it's a string, otherwise use as-is
        let items = pendingOrder.items;
        if (typeof items === 'string') {
          items = JSON.parse(items);
        }
        const parsedItems = Array.isArray(items) ? items : [];
        state.state.order.items = parsedItems.map((it: any) => ({
          product: it.product || '',
          quantity: Number(it.quantity) || 0,
          unit: it.unit || undefined,
          unitPrice: Number(it.unitPrice) || 0,
          totalPrice: Number(it.totalPrice) || 0
        }));
      } catch (err) {
        logger.error({ err, items: pendingOrder.items }, 'Error parsing order items');
        // leave empty
      }
      state.state.order.deliveryAddress = pendingOrder.deliveryAddress || '';
      state.state.order.deliveryInstructions = pendingOrder.deliveryInstructions || '';
      state.state.order.specialRequests = pendingOrder.specialRequests || '';
      state.state.order.deliveryDate = pendingOrder.estimatedDelivery ? new Date(pendingOrder.estimatedDelivery).toISOString().split('T')[0] : '';
      state.state.order.deliveryTime = pendingOrder.estimatedDelivery ? new Date(pendingOrder.estimatedDelivery).toISOString().split('T')[1]?.split('.')[0] || '' : '';
      state.state.order.notes = ''; // Additional notes field
      // Totals best-effort from items
      const subtotal = state.state.order.items.reduce((s, it) => s + (it.totalPrice || 0), 0);
      state.state.order.totals = { subtotal, tax: 0, shipping: 0, total: subtotal };
    }

    // Last messages (chronological order in output)
    state.state.lastMessages = (conversation.messages || [])
      .slice()
      .reverse()
      .map(m => ({ senderType: m.senderType === 'customer' ? 'customer' : 'assistant', content: m.content, timestamp: m.timestamp.toISOString() }));

    // Vendor products
    if (vendor?.aiProducts) {
      try {
        const products = JSON.parse(vendor.aiProducts);
        if (Array.isArray(products)) {
          state.state.vendor.aiProducts = products.map((p: any) => ({ name: p.name || p.product || '', price: Number(p.price) || undefined, unit: p.unit }));
        }
      } catch {
        // ignore malformed
      }
    }
    if (typeof vendor?.aiPreparationTimeMinutes === 'number') {
      state.state.vendor.aiPreparationTimeMinutes = vendor.aiPreparationTimeMinutes as number;
    }

    return state;
  }
}


