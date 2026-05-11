import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function queryConversation(conversationId) {
    try {
        // Get conversation details
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                customer: true,
                vendor: {
                    select: {
                        businessName: true,
                        aiBotName: true
                    }
                }
            }
        });
        if (!conversation) {
            console.log('Conversation not found');
            return;
        }
        console.log('\n=== CONVERSATION DETAILS ===');
        console.log(`ID: ${conversation.id}`);
        console.log(`Vendor: ${conversation.vendor.businessName}`);
        console.log(`Customer Phone: ${conversation.customer.phone}`);
        console.log(`Status: ${conversation.status}`);
        console.log(`Created: ${conversation.createdAt}`);
        // Get all messages
        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { timestamp: 'asc' }
        });
        console.log(`\n=== MESSAGES (${messages.length} total) ===\n`);
        messages.forEach((msg, idx) => {
            console.log(`[${idx + 1}] ${msg.timestamp.toISOString()}`);
            console.log(`    Sender: ${msg.senderType}`);
            console.log(`    Type: ${msg.type}`);
            console.log(`    Content: ${msg.content}`);
            console.log('');
        });
        // Get orders for this conversation
        const orders = await prisma.order.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'desc' }
        });
        console.log(`\n=== ORDERS (${orders.length} total) ===\n`);
        orders.forEach((order, idx) => {
            console.log(`[${idx + 1}] Order #${order.orderNumber}`);
            console.log(`    Status: ${order.status}`);
            console.log(`    Total: ₹${order.totalAmount / 100}`);
            console.log(`    Items: ${JSON.stringify(order.items, null, 2)}`);
            console.log(`    Created: ${order.createdAt}`);
            console.log(`    Confirmed: ${order.confirmedAt || 'Not confirmed'}`);
            console.log('');
        });
        // Get customer insights
        const insights = await prisma.customerInsights.findUnique({
            where: {
                customerId_vendorId: {
                    customerId: conversation.customerId,
                    vendorId: conversation.vendorId
                }
            }
        });
        if (insights) {
            console.log('\n=== CUSTOMER INSIGHTS ===');
            console.log(`Basic Details: ${insights.basicDetails || 'None'}`);
            console.log(`Current Order: ${insights.currentOrder || 'None'}`);
            console.log(`Preferences: ${insights.preferences || 'None'}`);
            console.log(`Delivery Address: ${insights.deliveryAddress || 'None'}`);
            console.log(`Special Requests: ${insights.specialRequests || 'None'}`);
        }
    }
    catch (error) {
        console.error('Error querying conversation:', error);
    }
    finally {
        await prisma.$disconnect();
    }
}
const conversationId = process.argv[2] || 'cmh3ufejt002s11k6x8htmhw1';
queryConversation(conversationId);
