import { prisma } from '../src/db/prisma.js';
import { CustomerInsightsService } from '../src/services/customerInsightsService.js';
import { logger } from '../src/logger.js';
/**
 * Migration script to generate initial customer insights
 * Analyzes existing conversations and creates customer insights for each customer-vendor pair
 */
class CustomerInsightsMigration {
    constructor() {
        this.insightsService = new CustomerInsightsService();
    }
    async run() {
        console.log('🚀 Starting Customer Insights Migration...');
        try {
            // Step 1: Get all unique customer-vendor pairs
            console.log('📊 Finding unique customer-vendor pairs...');
            const pairs = await this.getCustomerVendorPairs();
            console.log(`Found ${pairs.length} customer-vendor pairs`);
            // Step 2: Process each pair
            let processed = 0;
            let errors = 0;
            for (const pair of pairs) {
                try {
                    console.log(`\n🔄 Processing pair ${processed + 1}/${pairs.length}: Customer ${pair.customerId}, Vendor ${pair.vendorId}`);
                    await this.processCustomerVendorPair(pair.customerId, pair.vendorId);
                    processed++;
                    console.log(`✅ Successfully processed pair ${processed}/${pairs.length}`);
                }
                catch (error) {
                    errors++;
                    console.error(`❌ Error processing pair ${pair.customerId}-${pair.vendorId}:`, error);
                    logger.error('Migration error', {
                        error,
                        customerId: pair.customerId,
                        vendorId: pair.vendorId
                    });
                }
            }
            console.log(`\n🎉 Migration completed!`);
            console.log(`✅ Successfully processed: ${processed} pairs`);
            console.log(`❌ Errors: ${errors} pairs`);
        }
        catch (error) {
            console.error('💥 Migration failed:', error);
            logger.error('Migration failed', { error });
            throw error;
        }
    }
    async getCustomerVendorPairs() {
        const conversations = await prisma.conversation.findMany({
            select: {
                customerId: true,
                vendorId: true
            },
            distinct: ['customerId', 'vendorId']
        });
        return conversations.map(conv => ({
            customerId: conv.customerId,
            vendorId: conv.vendorId
        }));
    }
    async processCustomerVendorPair(customerId, vendorId) {
        // Check if insights already exist
        const existingInsights = await prisma.customerInsights.findUnique({
            where: {
                customerId_vendorId: {
                    customerId,
                    vendorId
                }
            }
        });
        if (existingInsights) {
            console.log(`  ⏭️  Insights already exist for this pair, skipping...`);
            return;
        }
        // Get conversation data
        const conversationData = await this.getConversationData(customerId, vendorId);
        if (!conversationData || conversationData.messages.length === 0) {
            console.log(`  ⚠️  No conversation data found, creating empty insights...`);
            await this.createEmptyInsights(customerId, vendorId);
            return;
        }
        // Generate insights using AI analysis
        console.log(`  🤖 Generating insights from ${conversationData.messages.length} messages...`);
        const insights = await this.generateInsightsFromConversation(conversationData);
        // Store insights
        await prisma.customerInsights.create({
            data: {
                customerId,
                vendorId,
                basicDetails: insights.basicDetails,
                purchaseHistory: insights.purchaseHistory,
                preferences: insights.preferences,
                communicationStyle: insights.communicationStyle
            }
        });
        console.log(`  💾 Insights stored successfully`);
    }
    async getConversationData(customerId, vendorId) {
        try {
            const conversation = await prisma.conversation.findFirst({
                where: {
                    customerId,
                    vendorId
                },
                include: {
                    messages: {
                        orderBy: { timestamp: 'desc' },
                        take: 30, // Last 30 messages
                        select: {
                            content: true,
                            senderType: true,
                            timestamp: true
                        }
                    },
                    orders: {
                        orderBy: { createdAt: 'desc' },
                        take: 10, // Last 10 orders
                        select: {
                            orderNumber: true,
                            items: true,
                            totalAmount: true,
                            status: true,
                            createdAt: true
                        }
                    }
                }
            });
            if (!conversation) {
                return null;
            }
            return {
                messages: conversation.messages.reverse(), // Chronological order
                orders: conversation.orders
            };
        }
        catch (error) {
            console.error('Error fetching conversation data:', error);
            return null;
        }
    }
    async generateInsightsFromConversation(data) {
        // For now, use basic analysis without AI
        // In production, this would use OpenAI to analyze the conversation
        const customerMessages = data.messages.filter(m => m.senderType === 'customer');
        const allContent = customerMessages.map(m => m.content).join(' ').toLowerCase();
        const insights = {
            basicDetails: '',
            purchaseHistory: '',
            preferences: '',
            communicationStyle: ''
        };
        // Extract communication style
        if (allContent.includes('mam') || allContent.includes('sir')) {
            insights.communicationStyle = 'Polite, uses respectful terms';
        }
        if (allContent.includes('please') || allContent.includes('thank you')) {
            insights.communicationStyle += (insights.communicationStyle ? '. ' : '') + 'Uses polite language';
        }
        // Extract delivery preferences
        if (allContent.includes('morning')) {
            insights.preferences = 'Prefers morning delivery';
        }
        else if (allContent.includes('evening')) {
            insights.preferences = 'Prefers evening delivery';
        }
        // Extract purchase history
        if (data.orders.length > 0) {
            const orderSummaries = data.orders.map(order => `Order ${order.orderNumber}: ₹${order.totalAmount} (${order.status})`);
            insights.purchaseHistory = orderSummaries.join(', ');
        }
        // Extract basic details (names, addresses)
        const namePattern = /(?:my name is|i am|call me)\s+([a-zA-Z\s]+)/i;
        const nameMatch = allContent.match(namePattern);
        if (nameMatch) {
            insights.basicDetails = `Name: ${nameMatch[1].trim()}`;
        }
        return insights;
    }
    async createEmptyInsights(customerId, vendorId) {
        await prisma.customerInsights.create({
            data: {
                customerId,
                vendorId,
                basicDetails: '',
                purchaseHistory: '',
                preferences: '',
                communicationStyle: ''
            }
        });
    }
    async cleanup() {
        await prisma.$disconnect();
    }
}
// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const migration = new CustomerInsightsMigration();
    migration.run()
        .then(() => {
        console.log('✅ Migration completed successfully');
        process.exit(0);
    })
        .catch((error) => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    })
        .finally(() => {
        migration.cleanup();
    });
}
export { CustomerInsightsMigration };
