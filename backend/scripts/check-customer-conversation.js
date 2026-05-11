import { prisma } from '../src/db/prisma.js';
import { logger } from '../src/logger.js';
/**
 * Check conversation for customer 9998887771
 * Analyze the issue with order updates being sent instead of welcome messages
 */
async function checkCustomerConversation() {
    const customerPhone = '9998887771';
    console.log(`🔍 Checking conversation for customer: ${customerPhone}`);
    try {
        // Find customer
        const customer = await prisma.customer.findUnique({
            where: { phone: customerPhone },
            include: {
                conversations: {
                    include: {
                        vendor: {
                            select: {
                                id: true,
                                businessName: true,
                                aiBotName: true,
                                aiGreeting: true,
                                aiSystemPrompt: true
                            }
                        },
                        messages: {
                            orderBy: { timestamp: 'asc' },
                            take: 10 // Last 10 messages
                        },
                        orders: {
                            orderBy: { createdAt: 'desc' },
                            take: 5 // Last 5 orders
                        }
                    },
                    orderBy: { updatedAt: 'desc' },
                    take: 1 // Most recent conversation
                }
            }
        });
        if (!customer) {
            console.log(`❌ Customer ${customerPhone} not found in database`);
            return;
        }
        console.log(`✅ Customer found: ${customer.id}`);
        console.log(`📅 Last interaction: ${customer.lastInteraction || 'Never'}`);
        console.log(`💬 Total conversations: ${customer.conversations.length}`);
        if (customer.conversations.length === 0) {
            console.log(`⚠️  No conversations found for this customer`);
            return;
        }
        const conversation = customer.conversations[0];
        console.log(`\n📋 Most recent conversation: ${conversation.id}`);
        console.log(`🏪 Vendor: ${conversation.vendor.businessName} (${conversation.vendor.aiBotName})`);
        console.log(`📊 Status: ${conversation.status}`);
        console.log(`📅 Created: ${conversation.createdAt}`);
        console.log(`📅 Updated: ${conversation.updatedAt}`);
        // Check messages
        console.log(`\n💬 Messages (${conversation.messages.length}):`);
        conversation.messages.forEach((message, index) => {
            const timestamp = new Date(message.timestamp).toLocaleString();
            const preview = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
            console.log(`  ${index + 1}. [${timestamp}] ${message.senderType}: ${preview}`);
        });
        // Check orders
        console.log(`\n📦 Orders (${conversation.orders.length}):`);
        conversation.orders.forEach((order, index) => {
            console.log(`  ${index + 1}. Order ${order.orderNumber}: ${order.status} - ₹${order.totalAmount}`);
        });
        // Analyze the issue
        console.log(`\n🔍 Analysis:`);
        const customerMessages = conversation.messages.filter(m => m.senderType === 'customer');
        const assistantMessages = conversation.messages.filter(m => m.senderType === 'assistant');
        console.log(`  - Customer messages: ${customerMessages.length}`);
        console.log(`  - Assistant messages: ${assistantMessages.length}`);
        if (customerMessages.length === 0) {
            console.log(`  ⚠️  No customer messages found - this might be a system issue`);
        }
        else {
            const firstCustomerMessage = customerMessages[0];
            const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
            console.log(`  - First customer message: "${firstCustomerMessage.content.substring(0, 100)}..."`);
            if (lastAssistantMessage) {
                console.log(`  - Last assistant response: "${lastAssistantMessage.content.substring(0, 100)}..."`);
                // Check if the response looks like an order update instead of welcome
                if (lastAssistantMessage.content.includes('order') ||
                    lastAssistantMessage.content.includes('update') ||
                    lastAssistantMessage.content.includes('confirmed')) {
                    console.log(`  ❌ ISSUE DETECTED: Last response looks like an order update, not a welcome message`);
                }
                else {
                    console.log(`  ✅ Last response looks appropriate`);
                }
            }
        }
        // Check if this is a new customer
        const isNewCustomer = customerMessages.length <= 1 && conversation.orders.length === 0;
        console.log(`  - Is new customer: ${isNewCustomer}`);
        if (isNewCustomer) {
            console.log(`  🎯 RECOMMENDATION: Should send welcome message with product details`);
        }
        else {
            console.log(`  🎯 RECOMMENDATION: Should continue with existing conversation flow`);
        }
        // Show vendor configuration
        console.log(`\n🤖 Vendor AI Configuration:`);
        console.log(`  - Bot Name: ${conversation.vendor.aiBotName}`);
        console.log(`  - Greeting: ${conversation.vendor.aiGreeting || 'Not set'}`);
        console.log(`  - System Prompt Length: ${conversation.vendor.aiSystemPrompt?.length || 0} characters`);
    }
    catch (error) {
        console.error('❌ Error checking conversation:', error);
        logger.error('Conversation check error', { error, customerPhone });
    }
}
// Run the check
checkCustomerConversation()
    .then(() => {
    console.log('\n✅ Conversation check completed');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Conversation check failed:', error);
    process.exit(1);
})
    .finally(() => {
    prisma.$disconnect();
});
