/**
 * Test script for Multi-Stage AI Worker
 * 
 * Sends test messages to the incoming queue to test the worker
 */

import { publishToQueue } from '../src/queue/sqsClient.js';
import { getTextQueueUrl } from '../src/config/env.js';
import { logger } from '../logger.js';

async function sendTestMessage() {
  try {
    const testMessage = {
      type: 'TextMessage',
      vendorId: process.env.TEST_VENDOR_ID || 'test-vendor-123',
      customerPhone: process.env.TEST_CUSTOMER_PHONE || '+1234567890',
      content: process.argv[2] || 'I want to order 2kg brownie',
      phoneNumberId: process.env.TEST_PHONE_NUMBER_ID || 'test-phone-id',
      whatsappMessageId: `test-msg-${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    const queueUrl = getTextQueueUrl();
    logger.info({ testMessage }, 'Sending test message to queue');

    await publishToQueue(queueUrl, testMessage);

    logger.info({
      queueUrl,
      message: testMessage.content
    }, '✅ Test message sent successfully');

    console.log('\n✅ Test message sent!');
    console.log(`Queue: ${queueUrl}`);
    console.log(`Message: "${testMessage.content}"`);
    console.log(`\nWatch the worker logs to see it process the message.\n`);
  } catch (error) {
    logger.error({ err: error }, 'Failed to send test message');
    console.error('❌ Failed to send test message:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  sendTestMessage()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { sendTestMessage };

