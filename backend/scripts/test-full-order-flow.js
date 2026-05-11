/**
 * Full Order Flow Test Script
 *
 * Sends all 40 questions from the order flow to multi-stage worker
 * and logs all responses to a file for analysis
 */
import { publishToQueue } from '../src/queue/sqsClient.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
// Test configuration
const TEST_VENDOR_ID = 'vendor_ibell_001';
const TEST_CUSTOMER_PHONE = '+919790690170';
const TEST_PHONE_NUMBER_ID = 'cmh8hyy2e000akoum7ky05pww';
const DELAY_BETWEEN_MESSAGES = 3000; // 3 seconds between messages
const MAX_WAIT_FOR_RESPONSE = 30000; // 30 seconds max wait for response
// All 40 questions in order
const QUESTIONS = [
    // Phase 1: Greetings
    "Hi, I'm interested in your products",
    "What products do you offer?",
    "Tell me more about the Karuppu Kavuni Brownie",
    "What's in it?",
    "Is it suitable for kids?",
    // Phase 2: Product Comparison
    "Actually, can you tell me about the Mapillai Samba instead?",
    "What's the difference between the two?",
    // Phase 3: Delivery Inquiry
    "Do you deliver to Coimbatore?",
    "How long does delivery take?",
    // Phase 4: Pricing
    "How much is 1kg Karuppu Kavuni Brownie?",
    "What's the price for Mapillai Samba?",
    // Phase 5: Order Placement
    "I'll take 1kg Karuppu Kavuni Brownie",
    // Phase 6: Contact & Delivery Info (Multiple Messages)
    "My name is Nilan",
    "Delivery address: Tower 10, 304, TVH Vista Heights, Trichy Road, Coimbatore 641045",
    "My phone number is 919998887771",
    "Please deliver before 8 PM",
    "The birthday is on 25th October, so deliver one day before",
    // Phase 7: Corrections
    "Actually, change the address to Tower 11, 305 instead",
    "Sorry, the phone number is 919998887772",
    "Can you change delivery time to 7 PM instead of 8 PM?",
    // Phase 8: Confirmation
    "Yes, everything looks correct now",
    // Phase 9: Quantity Update
    "Can you change the quantity to 2kg instead of 1kg?",
    // Phase 10: Product Change
    "Actually, change Karuppu Kavuni to Mapillai Samba",
    // Phase 11: Additional Requests
    "Can you add cashew toppings?",
    "What's the extra cost for toppings?",
    "Yes, add cashew toppings please",
    "Can you write \"Happy Birthday Nilan\" on it?",
    "What's the total amount?",
    "How can I make payment?",
    "Can I pay via UPI?",
    "What's your UPI ID?",
    "I'll send payment screenshot after transfer",
    "Can you confirm you received my payment?",
    // Phase 12: Additional Inquiries
    "What if I want to cancel?",
    "Can I change delivery date?",
    "Is there a minimum order quantity?",
    "Do you have any discounts?",
    "Can I get it gift wrapped?",
    // Phase 13: Final Delivery Inquiry
    "What's the estimated delivery time for my order?"
];
const logFile = join(process.cwd(), 'logs', `order-flow-test-${Date.now()}.json`);
const summaryFile = join(process.cwd(), 'logs', `order-flow-summary-${Date.now()}.txt`);
// Ensure logs directory exists
try {
    mkdirSync(join(process.cwd(), 'logs'), { recursive: true });
}
catch (e) {
    // Directory might already exist
}
async function waitForResponse(conversationId, afterMessageId, timeout) {
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second
    while (Date.now() - startTime < timeout) {
        // Check for new assistant message after the customer message
        const messages = await prisma.message.findMany({
            where: {
                conversationId,
                senderType: 'assistant',
                timestamp: {
                    gt: new Date(Date.now() - timeout)
                }
            },
            orderBy: { timestamp: 'desc' },
            take: 1
        });
        if (messages.length > 0) {
            const assistantMessage = messages[0];
            // Make sure this is a response to our message (timestamp after customer message)
            const customerMessage = await prisma.message.findUnique({
                where: { id: afterMessageId }
            });
            if (customerMessage && assistantMessage.timestamp > customerMessage.timestamp) {
                return assistantMessage;
            }
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    return null;
}
async function getStageExecutionLogs(messageId) {
    try {
        return await prisma.stageExecutionLog.findMany({
            where: { messageId },
            orderBy: { createdAt: 'asc' }
        });
    }
    catch (e) {
        return [];
    }
}
async function getQualityMetrics(messageId) {
    try {
        const metrics = await prisma.qualityMetrics.findMany({
            where: { messageId },
            orderBy: { createdAt: 'desc' },
            take: 1
        });
        return metrics.length > 0 ? metrics[0] : null;
    }
    catch (e) {
        return null;
    }
}
async function sendQuestionAndWait(questionNumber, question, conversationId) {
    const log = {
        questionNumber,
        question,
        timestamp: new Date().toISOString()
    };
    try {
        console.log(`\n[${questionNumber}/40] Sending: "${question}"`);
        // Ensure conversation exists
        let finalConversationId = conversationId;
        if (!finalConversationId) {
            const { ensureConversation } = await import('../src/services/messageProcessor.js');
            const { conversation } = await ensureConversation(TEST_VENDOR_ID, TEST_CUSTOMER_PHONE);
            finalConversationId = conversation.id;
            log.conversationId = finalConversationId;
        }
        else {
            log.conversationId = finalConversationId;
        }
        // Send message to queue
        const whatsappMessageId = `test-msg-${Date.now()}-${questionNumber}`;
        const messageData = {
            type: 'TextMessage',
            vendorId: TEST_VENDOR_ID,
            customerPhone: TEST_CUSTOMER_PHONE,
            content: question,
            phoneNumberId: TEST_PHONE_NUMBER_ID,
            whatsappMessageId,
            timestamp: new Date().toISOString()
        };
        await publishToQueue(env.INCOMING_QUEUE_URL, messageData);
        console.log(`  ✓ Message queued`);
        // Wait a bit for message to be stored
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Find the stored customer message
        const customerMessages = await prisma.message.findMany({
            where: {
                conversationId: finalConversationId,
                senderType: 'customer',
                content: question
            },
            orderBy: { timestamp: 'desc' },
            take: 1
        });
        if (customerMessages.length > 0) {
            const customerMessage = customerMessages[0];
            log.messageId = customerMessage.id;
            console.log(`  ⏳ Waiting for response... (max ${MAX_WAIT_FOR_RESPONSE / 1000}s)`);
            // Wait for response
            const startWait = Date.now();
            const response = await waitForResponse(finalConversationId, customerMessage.id, MAX_WAIT_FOR_RESPONSE);
            const waitTime = Date.now() - startWait;
            if (response) {
                log.response = response.content;
                log.responseTimestamp = response.timestamp.toISOString();
                log.processingTime = waitTime;
                console.log(`  ✓ Response received (${waitTime}ms)`);
                console.log(`  Response: "${response.content.substring(0, 100)}${response.content.length > 100 ? '...' : ''}"`);
                // Get stage execution logs
                const stageLogs = await getStageExecutionLogs(customerMessage.id);
                if (stageLogs.length > 0) {
                    log.stagesExecuted = stageLogs.map((log) => log.stageName);
                    log.tokensUsed = stageLogs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
                    log.cost = stageLogs.reduce((sum, log) => sum + (log.cost || 0), 0);
                    console.log(`  ✓ Stages: ${log.stagesExecuted.join(', ')}`);
                    console.log(`  ✓ Tokens: ${log.tokensUsed}, Cost: $${log.cost?.toFixed(6) || '0'}`);
                }
                // Get quality metrics
                const qualityMetrics = await getQualityMetrics(customerMessage.id);
                if (qualityMetrics) {
                    log.qualityScore = qualityMetrics.overallScore;
                    console.log(`  ✓ Quality Score: ${log.qualityScore}/5.0`);
                }
            }
            else {
                log.error = 'No response received within timeout';
                console.log(`  ⚠️  No response received within ${MAX_WAIT_FOR_RESPONSE / 1000}s`);
            }
        }
        else {
            log.error = 'Customer message not found in database';
            console.log(`  ⚠️  Customer message not stored`);
        }
    }
    catch (error) {
        log.error = error.message || String(error);
        console.error(`  ❌ Error: ${log.error}`);
    }
    // Append to log file
    appendFileSync(logFile, JSON.stringify(log) + '\n');
    return log;
}
async function runFullTest() {
    console.log('🚀 Starting Full Order Flow Test');
    console.log('='.repeat(80));
    console.log(`Vendor ID: ${TEST_VENDOR_ID}`);
    console.log(`Customer Phone: ${TEST_CUSTOMER_PHONE}`);
    console.log(`Queue URL: ${env.INCOMING_QUEUE_URL}`);
    console.log(`Log File: ${logFile}`);
    console.log(`Summary File: ${summaryFile}`);
    console.log('='.repeat(80));
    // Initialize log file
    writeFileSync(logFile, '');
    writeFileSync(summaryFile, `Full Order Flow Test - ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`);
    let conversationId;
    const allLogs = [];
    const startTime = Date.now();
    for (let i = 0; i < QUESTIONS.length; i++) {
        const question = QUESTIONS[i];
        const questionNumber = i + 1;
        const log = await sendQuestionAndWait(questionNumber, question, conversationId);
        allLogs.push(log);
        if (log.conversationId) {
            conversationId = log.conversationId;
        }
        // Wait before next message (except for last one)
        if (i < QUESTIONS.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
        }
    }
    const totalTime = Date.now() - startTime;
    // Generate summary
    const successful = allLogs.filter(l => l.response).length;
    const failed = allLogs.filter(l => l.error || !l.response).length;
    const totalTokens = allLogs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0);
    const totalCost = allLogs.reduce((sum, l) => sum + (l.cost || 0), 0);
    const avgQuality = allLogs
        .filter(l => l.qualityScore)
        .reduce((sum, l) => sum + (l.qualityScore || 0), 0) / allLogs.filter(l => l.qualityScore).length;
    const avgProcessingTime = allLogs
        .filter(l => l.processingTime)
        .reduce((sum, l) => sum + (l.processingTime || 0), 0) / allLogs.filter(l => l.processingTime).length;
    const summary = `
TEST SUMMARY
${'='.repeat(80)}
Total Questions: ${QUESTIONS.length}
Successful Responses: ${successful}
Failed/No Response: ${failed}
Success Rate: ${((successful / QUESTIONS.length) * 100).toFixed(1)}%

PERFORMANCE METRICS
${'-'.repeat(80)}
Total Test Time: ${(totalTime / 1000).toFixed(1)}s
Average Processing Time: ${avgProcessingTime ? (avgProcessingTime / 1000).toFixed(2) : 'N/A'}s
Total Tokens Used: ${totalTokens.toLocaleString()}
Total Cost: $${totalCost.toFixed(6)}
Average Cost per Message: $${(totalCost / successful || 0).toFixed(6)}
Average Quality Score: ${avgQuality ? avgQuality.toFixed(2) : 'N/A'}/5.0

CONVERSATION ID
${'-'.repeat(80)}
${conversationId || 'N/A'}

DETAILED LOGS
${'-'.repeat(80)}
See: ${logFile}

${'='.repeat(80)}
`;
    appendFileSync(summaryFile, summary);
    console.log(summary);
    // Save complete log as JSON array
    const completeLog = {
        testInfo: {
            timestamp: new Date().toISOString(),
            vendorId: TEST_VENDOR_ID,
            customerPhone: TEST_CUSTOMER_PHONE,
            conversationId,
            totalQuestions: QUESTIONS.length
        },
        summary: {
            successful,
            failed,
            successRate: (successful / QUESTIONS.length) * 100,
            totalTime: totalTime / 1000,
            avgProcessingTime: avgProcessingTime ? avgProcessingTime / 1000 : null,
            totalTokens,
            totalCost,
            avgCostPerMessage: totalCost / successful || 0,
            avgQualityScore: avgQuality || null
        },
        logs: allLogs
    };
    const jsonLogFile = logFile.replace('.json', '-complete.json');
    writeFileSync(jsonLogFile, JSON.stringify(completeLog, null, 2));
    console.log(`\n✅ Complete log saved to: ${jsonLogFile}`);
    console.log(`✅ Summary saved to: ${summaryFile}`);
    console.log(`\n💡 To analyze with database, run:`);
    console.log(`   npx tsx scripts/analyzeMultiStageConversation.ts ${conversationId || '<conversationId>'}`);
}
// Run the test
runFullTest()
    .then(() => {
    console.log('\n✅ Test completed!');
    process.exit(0);
})
    .catch((err) => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
});
