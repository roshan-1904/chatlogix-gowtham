import { receiveMessages, deleteMessage } from '../queue/sqsClient.js';
import { env, getTextQueueUrl } from '../config/env.js';
import { logger, StepLogger, createOperationId } from '../logger.js';
import { processIncomingTextMessage, processBatchIncomingMessages, storeIncomingMessage, isAIPaused, ensureConversation } from '../services/messageProcessor.js';
import { readPendingMessages, markMessageProcessed } from '../services/webhookFallbackService.js';

/**
 * Check if multi-stage AI processing should be used for this conversation
 * This matches the logic in multiStageAIWorker.ts
 */
function checkShouldUseMultiStage(conversationId: string): boolean {
  const enableMultiStage = env.ENABLE_MULTI_STAGE_AI;
  const rolloutPercentage = env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE;
  
  // If explicitly disabled
  if (enableMultiStage === 'false') {
    return false;
  }
  
  // If explicitly enabled
  if (enableMultiStage === 'true') {
    return true;
  }
  
  // Percentage-based rollout
  if (rolloutPercentage) {
    const percentage = parseInt(rolloutPercentage, 10);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return false;
    }
    
    // Use hash of conversationId to determine eligibility (same logic as multi-stage worker)
    let hash = 0;
    for (let i = 0; i < conversationId.length; i++) {
      const char = conversationId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    hash = Math.abs(hash);
    
    return (hash % 100) < percentage;
  }
  
  // Default: disabled
  return false;
}

/**
 * Process log files on worker startup
 */
async function processLogFilesOnStartup() {
  const operationId = createOperationId('log_file_recovery');
  const stepLogger = new StepLogger(operationId, 'Log File Recovery', {});

  try {
    stepLogger.step('Reading pending messages from log files');
    const pendingMessages = await readPendingMessages();
    
    if (pendingMessages.length === 0) {
      stepLogger.step('No pending messages found in log files');
      return;
    }

    stepLogger.step(`Found ${pendingMessages.length} pending messages`);

    // Group messages by conversation (vendorId + customerPhone)
    const messagesByConversation = new Map<string, Array<{ entry: any; filePath: string; lineNumber: number }>>();
    
    for (const { entry, filePath, lineNumber } of pendingMessages) {
      const key = `${entry.messageData.vendorId}-${entry.messageData.customerPhone}`;
      if (!messagesByConversation.has(key)) {
        messagesByConversation.set(key, []);
      }
      messagesByConversation.get(key)!.push({ entry, filePath, lineNumber });
    }

    stepLogger.step(`Grouped into ${messagesByConversation.size} conversations`);

    // Process each conversation group
    for (const [key, messages] of messagesByConversation.entries()) {
      const firstMessage = messages[0].entry.messageData;
      const convStepLogger = new StepLogger(
        createOperationId('log_recovery_conv'),
        'Log Recovery Conversation',
        { vendorId: firstMessage.vendorId, customerPhone: firstMessage.customerPhone, messageCount: messages.length }
      );

      try {
        // Ensure conversation exists and get conversationId
        const { conversation } = await ensureConversation(firstMessage.vendorId, firstMessage.customerPhone);
        const conversationId = conversation.id;

        // Check AI pause status
        convStepLogger.step('Checking AI pause status');
        const aiPaused = await isAIPaused(conversationId);

        if (aiPaused) {
          convStepLogger.step('AI is paused - storing messages but skipping processing');
          // Store messages in DB
          for (const { entry } of messages) {
            try {
              await storeIncomingMessage(
                entry.messageData.vendorId,
                entry.messageData.customerPhone,
                entry.messageData.content,
                entry.messageData.phoneNumberId
              );
            } catch (storeError) {
              convStepLogger.error(storeError as Error, { step: 'store_message_from_log' });
            }
          }
          // Mark all as processed
          for (const { entry, filePath, lineNumber } of messages) {
            try {
              await markMessageProcessed(entry, filePath, lineNumber);
            } catch (markError) {
              convStepLogger.warn('Failed to mark message as processed', { error: markError });
            }
          }
          convStepLogger.success({ stored: true, processed: false, reason: 'ai_paused' });
        } else {
          // Process batch
          convStepLogger.step('Processing batch of messages');
          const messageDataArray = messages.map(({ entry }) => ({
            vendorId: entry.messageData.vendorId,
            customerPhone: entry.messageData.customerPhone,
            content: entry.messageData.content,
            phoneNumberId: entry.messageData.phoneNumberId,
            whatsappMessageId: entry.messageData.whatsappMessageId,
            timestamp: entry.messageData.timestamp
          }));

          await processBatchIncomingMessages(messageDataArray);

          // Mark all as processed
          for (const { entry, filePath, lineNumber } of messages) {
            try {
              await markMessageProcessed(entry, filePath, lineNumber);
            } catch (markError) {
              convStepLogger.warn('Failed to mark message as processed', { error: markError });
            }
          }
          convStepLogger.success({ processed: true, messageCount: messages.length });
        }
      } catch (error) {
        convStepLogger.error(error as Error, { conversationKey: key });
        logger.error({ err: error, conversationKey: key }, 'Failed to process conversation from log files');
        // Continue with next conversation
      }
    }

    stepLogger.success({ conversationsProcessed: messagesByConversation.size });
  } catch (error) {
    stepLogger.error(error as Error, { step: 'log_file_recovery' });
    logger.error({ err: error }, 'Log file recovery failed');
  }
}

async function loop() {
  const textQueueUrl = getTextQueueUrl();
  while (true) {
    const messages = await receiveMessages(textQueueUrl, 10);
    
    if (messages.length === 0) {
      continue;
    }

    // Group messages by conversation (vendorId + customerPhone)
    const messagesByConversation = new Map<string, Array<{ sqsMessage: any; body: any }>>();
    
    for (const m of messages) {
      if (!m.Body || !m.ReceiptHandle) {
        continue;
      }

      try {
        const body = JSON.parse(m.Body);
        if (body.type === 'TextMessage') {
          const key = `${body.vendorId}-${body.customerPhone}`;
          if (!messagesByConversation.has(key)) {
            messagesByConversation.set(key, []);
          }
          messagesByConversation.get(key)!.push({ sqsMessage: m, body });
        }
      } catch (parseError) {
        logger.warn({ error: parseError, messageId: m.MessageId }, 'Failed to parse message body');
      }
    }

    // Process each conversation group
    for (const [key, conversationMessages] of messagesByConversation.entries()) {
      const firstMessage = conversationMessages[0].body;
      const operationId = createOperationId('incoming_worker');
      const stepLogger = new StepLogger(operationId, 'Incoming Message Worker', {
        conversationKey: key,
        messageCount: conversationMessages.length,
        vendorId: firstMessage.vendorId,
        customerPhone: firstMessage.customerPhone
      });

      try {
        // Store all messages in DB first
        stepLogger.step('Storing messages in database');
        const { conversation } = await ensureConversation(firstMessage.vendorId, firstMessage.customerPhone);
        const conversationId = conversation.id;

        const storedMessageIds = [];
        for (const { body } of conversationMessages) {
          const stored = await storeIncomingMessage(
            body.vendorId,
            body.customerPhone,
            body.content,
            body.phoneNumberId
          );
          storedMessageIds.push(stored.messageId);
        }

        stepLogger.step(`Stored ${storedMessageIds.length} messages`);

        // Check AI pause status
        stepLogger.step('Checking AI pause status');
        const aiPaused = await isAIPaused(conversationId);

        if (aiPaused) {
          stepLogger.step('AI is paused - skipping processing', { conversationId });
          stepLogger.success({ stored: true, processed: false, reason: 'ai_paused' });
          
          // Delete all messages from queue since they're stored
          for (const { sqsMessage } of conversationMessages) {
            try {
              await deleteMessage(textQueueUrl, sqsMessage.ReceiptHandle);
            } catch (deleteError) {
              stepLogger.warn('Failed to delete message from queue', { error: deleteError });
            }
          }
          continue;
        }

        // Check if multi-stage AI worker should handle this conversation
        // If enabled, skip processing here and let multi-stage worker handle it
        // IMPORTANT: Don't delete messages - let multi-stage worker process and delete them
        // SQS visibility timeout ensures only one worker processes each message
        const shouldUseMultiStage = checkShouldUseMultiStage(conversationId);
        if (shouldUseMultiStage) {
          stepLogger.step('Multi-stage AI processing enabled - skipping legacy processing', { 
            conversationId,
            reason: 'multi_stage_handling'
          });
          stepLogger.success({ stored: true, processed: false, reason: 'multi_stage_handling' });
          
          // CRITICAL: Don't delete messages here - let multi-stage worker handle them
          // Messages will become visible again after visibility timeout if multi-stage worker fails
          // This ensures no duplicate processing while allowing gradual rollout
          continue;
        }

        // Process messages (single or batch)
        if (conversationMessages.length === 1) {
          stepLogger.step('Processing single message');
          const body = conversationMessages[0].body;
          body.messageId = storedMessageIds[0];
          body.conversationId = conversationId;
          body.customerId = conversation.customerId;

          try {
            await processIncomingTextMessage(body);
            stepLogger.success({ processed: true });
          } catch (processError) {
            stepLogger.error(processError as Error, { messageId: body.messageId });
            logger.error({ err: processError }, 'Failed processing incoming message');
            // Don't delete on error - let SQS retry
            continue;
          }
        } else {
          stepLogger.step('Processing batch of messages', { count: conversationMessages.length });
          const messageDataArray = conversationMessages.map(({ body }, index) => ({
            vendorId: body.vendorId,
            customerPhone: body.customerPhone,
            content: body.content,
            phoneNumberId: body.phoneNumberId,
            whatsappMessageId: body.whatsappMessageId,
            timestamp: body.timestamp || new Date().toISOString()
          }));

          try {
            await processBatchIncomingMessages(messageDataArray);
            stepLogger.success({ processed: true, batchSize: conversationMessages.length });
          } catch (processError) {
            stepLogger.error(processError as Error, { messageCount: conversationMessages.length });
            logger.error({ err: processError }, 'Failed processing batch of messages');
            // Don't delete on error - let SQS retry
            continue;
          }
        }

        // Delete all messages from SQS after successful processing
        stepLogger.step('Deleting processed messages from SQS');
        for (const { sqsMessage } of conversationMessages) {
          try {
            await deleteMessage(textQueueUrl, sqsMessage.ReceiptHandle);
          } catch (deleteError) {
            stepLogger.warn('Failed to delete message from queue', { error: deleteError });
          }
        }
        stepLogger.success({ processed: true, messageDeleted: true });
      } catch (err) {
        stepLogger.error(err as Error, { conversationKey: key });
        logger.error({ err, conversationKey: key }, 'Incoming message worker failed for conversation');
        // Messages will remain in queue for retry
      }
    }
  }
}

// Process log files on startup, then start main loop
processLogFilesOnStartup()
  .then(() => {
    logger.info('Log file recovery completed, starting main worker loop');
    loop().catch((err) => {
      logger.error({ err }, 'Incoming message worker crashed');
      process.exit(1);
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Log file recovery failed, starting worker anyway');
    loop().catch((err) => {
      logger.error({ err }, 'Incoming message worker crashed');
      process.exit(1);
    });
  });

