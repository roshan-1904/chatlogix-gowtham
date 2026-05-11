import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
// Load environment variables
const localEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
if (existsSync(localEnvPath)) {
    config({ path: localEnvPath });
}
else if (existsSync(rootEnvPath)) {
    config({ path: rootEnvPath });
}
else {
    config();
}
const prisma = new PrismaClient();
async function deleteMessagesByPhone(phone) {
    console.log(`Starting deletion process for phone: ${phone}`);
    try {
        // Step 1: Find the customer
        const customer = await prisma.customer.findUnique({
            where: { phone },
            include: {
                conversations: {
                    include: {
                        messages: true
                    }
                }
            }
        });
        if (!customer) {
            console.log(`No customer found with phone: ${phone}`);
            return;
        }
        console.log(`Found customer: ${customer.id}`);
        // Count messages
        let totalMessages = 0;
        for (const conv of customer.conversations) {
            totalMessages += conv.messages.length;
        }
        console.log(`Found ${customer.conversations.length} conversations with ${totalMessages} total messages`);
        // Step 2: Delete all messages
        let deletedCount = 0;
        for (const conv of customer.conversations) {
            const result = await prisma.message.deleteMany({
                where: {
                    conversationId: conv.id
                }
            });
            deletedCount += result.count;
            console.log(`Deleted ${result.count} messages from conversation ${conv.id}`);
        }
        console.log(`\nTotal messages deleted: ${deletedCount}`);
        // Step 3: Delete credit usages first (to avoid foreign key constraint)
        const creditUsagesDeleted = await prisma.creditUsage.deleteMany({
            where: {
                conversation: {
                    customerId: customer.id
                }
            }
        });
        console.log(`Deleted ${creditUsagesDeleted.count} credit usages`);
        // Step 4: Delete orders (optional)
        const ordersDeleted = await prisma.order.deleteMany({
            where: {
                customerId: customer.id
            }
        });
        console.log(`Deleted ${ordersDeleted.count} orders`);
        // Step 5: Delete customer insights (optional)
        const insightsDeleted = await prisma.customerInsights.deleteMany({
            where: {
                customerId: customer.id
            }
        });
        console.log(`Deleted ${insightsDeleted.count} customer insights`);
        // Step 6: Delete conversations after removing all references
        const conversationsDeleted = await prisma.conversation.deleteMany({
            where: {
                customerId: customer.id
            }
        });
        console.log(`Deleted ${conversationsDeleted.count} conversations`);
        // Step 7: Delete the customer record
        await prisma.customer.delete({
            where: { id: customer.id }
        });
        console.log('Customer record deleted');
        console.log('\n✅ Deletion completed successfully!');
    }
    catch (error) {
        console.error('Error deleting messages:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
// Get phone number from command line argument
const phoneNumber = process.argv[2];
if (!phoneNumber) {
    console.error('Please provide a phone number as an argument');
    console.error('Usage: ts-node delete-messages-by-phone.ts <phone-number>');
    process.exit(1);
}
deleteMessagesByPhone(phoneNumber)
    .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
