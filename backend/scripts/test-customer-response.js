import { prisma } from '../src/db/prisma.js';
import { AIService } from '../src/services/aiService.js';
import { logger } from '../src/logger.js';
/**
 * Test the fixed AI response for customer 9998887771
 * This will test the new customer greeting detection and welcome message flow
 */
async function testCustomerResponse() {
    const customerPhone = '9998887771';
    const testMessage = 'Hi Mam';
    console.log(`🧪 Testing AI response for customer: ${customerPhone}`);
    console.log(`📝 Test message: "${testMessage}"`);
    try {
        // Find the customer and conversation
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
                                aiGreeting: true
                            }
                        }
                    },
                    orderBy: { updatedAt: 'desc' },
                    take: 1
                }
            }
        });
        if (!customer || customer.conversations.length === 0) {
            console.log(`❌ Customer or conversation not found`);
            return;
        }
        const conversation = customer.conversations[0];
        const vendorId = conversation.vendor.id;
        console.log(`✅ Found conversation: ${conversation.id}`);
        console.log(`🏪 Vendor: ${conversation.vendor.businessName} (${conversation.vendor.aiBotName})`);
        // Test the AI service
        const aiService = new AIService();
        console.log(`\n🤖 Testing AI response generation...`);
        // Test the new customer greeting detection
        const isNewCustomer = await aiService['isNewCustomerGreeting'](conversation.id, testMessage);
        console.log(`🔍 Is new customer greeting: ${isNewCustomer}`);
        if (isNewCustomer) {
            console.log(`✅ Correctly detected as new customer greeting`);
            // Test welcome message generation
            const welcomeMessage = await aiService['sendWelcomeMessage'](vendorId, testMessage, conversation.id);
            console.log(`\n💬 Generated welcome message:`);
            console.log(`"${welcomeMessage}"`);
            // Check if it's a proper welcome message
            if (welcomeMessage.includes('welcome') ||
                welcomeMessage.includes('Hello') ||
                welcomeMessage.includes('Hi') ||
                welcomeMessage.includes('brownie') ||
                welcomeMessage.includes('product')) {
                console.log(`✅ Welcome message looks appropriate`);
            }
            else {
                console.log(`⚠️  Welcome message might not be appropriate`);
            }
        }
        else {
            console.log(`❌ Failed to detect as new customer greeting`);
        }
        // Test the full response generation
        console.log(`\n🔄 Testing full response generation...`);
        const response = await aiService.generateResponse(testMessage, 'general', vendorId, conversation.id);
        console.log(`\n💬 Full AI response:`);
        console.log(`"${response}"`);
        // Analyze the response
        console.log(`\n📊 Response Analysis:`);
        if (response.includes('order') && response.includes('IBE-')) {
            console.log(`❌ ISSUE: Response still mentions existing order`);
        }
        else if (response.includes('welcome') || response.includes('Hello') || response.includes('brownie')) {
            console.log(`✅ SUCCESS: Response is a proper welcome message`);
        }
        else {
            console.log(`⚠️  Response is unclear - needs review`);
        }
        // Test structured response
        console.log(`\n🔄 Testing structured response...`);
        try {
            const structuredResponse = await aiService.generateStructuredResponse(testMessage, 'general', vendorId, conversation.id);
            console.log(`\n📋 Structured response:`);
            console.log(`Customer Message: "${structuredResponse.customerMessage}"`);
            console.log(`Has Order Event: ${!!structuredResponse.orderUpdateEvent}`);
            console.log(`Has Customer Event: ${!!structuredResponse.customerUpdateEvent}`);
            console.log(`Reasoning: ${structuredResponse.reasoning}`);
        }
        catch (error) {
            console.log(`⚠️  Structured response failed: ${error}`);
        }
    }
    catch (error) {
        console.error('❌ Error testing customer response:', error);
        logger.error('Customer response test error', { error, customerPhone });
    }
}
// Run the test
testCustomerResponse()
    .then(() => {
    console.log('\n✅ Customer response test completed');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Customer response test failed:', error);
    process.exit(1);
})
    .finally(() => {
    prisma.$disconnect();
});
