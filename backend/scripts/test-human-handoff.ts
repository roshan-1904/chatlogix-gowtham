
import { PrismaClient } from '@prisma/client';
import { MultiStageOrchestrator } from '../src/services/multiStageOrchestrator.js';
import { logger } from '../src/logger.js';
import { setHandoffConfirmationStatus } from '../src/services/conversationMemoryService.js';

// Setup prisma directly if not using the global instance from app
const prisma = new PrismaClient();

async function testHumanHandoff() {
    console.log('🧪 Starting TWO-STEP Human Handoff Test...');

    try {
        // 1. Get or Create Vendor
        let vendor = await prisma.vendor.findFirst({ where: { businessName: 'HandoffTestVendor' } });
        if (!vendor) {
            vendor = await prisma.vendor.create({
                data: {
                    businessName: 'HandoffTestVendor',
                    phone: '+15555555555',
                    email: 'test@handoff.com',
                    subscriptionPlan: 'pro',
                    aiBotName: 'TestBot'
                }
            });
        }

        // 2. Get or Create Customer
        let customer = await prisma.customer.findUnique({ where: { phone: '+19999999999' } });
        if (!customer) {
            customer = await prisma.customer.create({
                data: { phone: '+19999999999' }
            });
        }

        // 3. Create/Reset Conversation
        // Delete existing to start fresh
        const existingConv = await prisma.conversation.findFirst({ where: { customerId: customer.id, vendorId: vendor.id } });
        if (existingConv) {
            await prisma.conversation.delete({ where: { id: existingConv.id } });
        }

        const conversation = await prisma.conversation.create({
            data: {
                vendorId: vendor.id,
                customerId: customer.id,
                status: 'open',
                aiPaused: false
            }
        });
        console.log('✅ Created fresh conversation:', conversation.id);

        // Reset any redis state
        await setHandoffConfirmationStatus(conversation.id, false);

        const orchestrator = new MultiStageOrchestrator();

        // --- TEST STEP 1: REQUEST HANDOFF ---
        console.log('\n📨 Sending Step 1: "I want to speak to a human agent"');
        const result1 = await orchestrator.execute({
            conversationId: conversation.id,
            vendorId: vendor.id,
            customerId: customer.id,
            messageId: `msg-1-${Date.now()}`,
            rawMessage: "I want to speak to a human agent please"
        });

        console.log('📊 Result 1:', result1.finalMessage);

        if (result1.finalMessage.includes("Reply 'Yes' to confirm")) {
            console.log('✅ Step 1 Success: Received confirmation request');
        } else {
            console.error('❌ Step 1 Failed: Did not receive confirmation request');
        }

        // Ensure DB is NOT paused yet
        const convAfterStep1 = await prisma.conversation.findUnique({ where: { id: conversation.id } });
        if (convAfterStep1?.aiPaused === false) {
            console.log('✅ Step 1 Success: AI is NOT paused yet');
        } else {
            console.error('❌ Step 1 Failed: AI is paused prematurely');
        }

        // --- TEST STEP 2: CONFIRM HANDOFF ---
        console.log('\n📨 Sending Step 2: "Yes"');
        const result2 = await orchestrator.execute({
            conversationId: conversation.id,
            vendorId: vendor.id,
            customerId: customer.id,
            messageId: `msg-2-${Date.now()}`,
            rawMessage: "Yes, please connect me"
        });

        console.log('📊 Result 2:', result2.finalMessage);

        if (result2.finalMessage.includes("AI Support is now PAUSED")) {
            console.log('✅ Step 2 Success: Received Paused message');
        } else {
            console.error('❌ Step 2 Failed: Did not receive Paused message');
        }

        // Check 3: Database Update (aiPaused)
        const updatedConversation = await prisma.conversation.findUnique({
            where: { id: conversation.id }
        });

        if (updatedConversation?.aiPaused === true) {
            console.log('✅ Step 2 Success: Database updated, aiPaused is true');
        } else {
            console.error('❌ Step 2 Failed: Database update failed');
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error);
    } finally {
        await prisma.$disconnect();
        // setTimeout(() => process.exit(0), 1000); // Helper to exit if handles hang
    }
}

testHumanHandoff();
