import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeOrder() {
  try {
    const orderNumber = 'ORD-VENDORI-1765093649173';
    
    // Get order details
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        vendor: { select: { businessName: true, aiBotName: true, phone: true } },
        customer: { select: { phone: true } },
        conversation: {
          include: {
            messages: {
              orderBy: { timestamp: 'asc' },
              select: { content: true, senderType: true, timestamp: true }
            }
          }
        }
      }
    });

    if (!order) {
      console.log('Order not found');
      return;
    }

    // Get customer insights
    const customerInsights = await prisma.customerInsights.findFirst({
      where: {
        customerId: order.customerId,
        vendorId: order.vendorId
      }
    });

    // Get conversation memory
    const conversationMemory = await prisma.conversationMemory.findUnique({
      where: { conversationId: order.conversationId }
    });

    console.log('=== ORDER DETAILS ===');
    console.log(JSON.stringify({
      orderNumber: order.orderNumber,
      status: order.status,
      items: order.items,
      totalAmount: order.totalAmount,
      deliveryAddress: order.deliveryAddress,
      deliveryInstructions: order.deliveryInstructions,
      specialRequests: order.specialRequests,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    }, null, 2));

    console.log('\n=== CUSTOMER INSIGHTS ===');
    console.log(JSON.stringify(customerInsights, null, 2));

    console.log('\n=== CONVERSATION MEMORY ===');
    console.log(JSON.stringify(conversationMemory, null, 2));

    console.log('\n=== CONVERSATION MESSAGES ===');
    console.log(`Total messages: ${order.conversation.messages.length}`);
    order.conversation.messages.forEach((msg, idx) => {
      console.log(`\n[${idx + 1}] ${msg.senderType} - ${msg.timestamp}`);
      console.log(msg.content.substring(0, 200));
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeOrder();
