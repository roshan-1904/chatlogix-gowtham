/**
 * Multi-Stage AI Processing Worker
 * 
 * Processes incoming messages through the multi-stage AI pipeline
 * Can be gradually enabled via feature flags
 * 
 * Reference:
 * - Multi-Stage AI Worker Implementation Plan
 * - Phase 8: Migration Plan (Implementation Plan)
 */

import { receiveMessages, deleteMessage } from '../queue/sqsClient.js';
import { env, getTextQueueUrl } from '../config/env.js';
import { logger, StepLogger, createOperationId } from '../logger.js';
import { MultiStageOrchestrator } from '../services/multiStageOrchestrator.js';
import { processIncomingTextMessage, ensureConversation, storeIncomingMessage, isAIPaused } from '../services/messageProcessor.js';
import { StageContext } from '../types/multiStage.js';

/**
 * Check if multi-stage AI processing should be used for this conversation
 */
function shouldUseMultiStage(conversationId: string): boolean {
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
    const percentage = Number.parseInt(rolloutPercentage, 10);
    if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
      logger.warn({ rolloutPercentage }, 'Invalid rollout percentage, defaulting to false');
      return false;
    }
    
    // Use hash of conversationId to determine eligibility
    const hash = simpleHash(conversationId);
    const eligible = (hash % 100) < percentage;
    
    logger.debug({
      conversationId,
      hash,
      percentage,
      eligible
    }, 'Percentage-based rollout check');
    
    return eligible;
  }
  
  // Default: disabled
  return false;
}

/**
 * Simple hash function for consistent percentage-based rollout
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.codePointAt(i) ?? 0;
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Process a single message through multi-stage pipeline
 */
async function processWithMultiStage(
  body: any,
  conversationId: string,
  messageId: string,
  customerId: string,
  stepLogger: StepLogger
): Promise<void> {
  try {
    stepLogger.step('Initializing multi-stage orchestrator');
    const orchestrator = new MultiStageOrchestrator();
    
    const context: StageContext = {
      conversationId,
      vendorId: body.vendorId,
      customerId,
      messageId,
      rawMessage: body.content
    };
    
    stepLogger.step('Executing multi-stage pipeline');
    const result = await orchestrator.execute(context);
    
    stepLogger.step('Multi-stage processing completed', {
      stagesExecuted: result.stagesExecuted.length,
      stagesSkipped: result.stagesSkipped.length,
      totalTokensUsed: result.totalTokensUsed,
      totalCost: result.totalCost,
      qualityScore: result.qualityScore
    });

    // Assistant message is created by responseWorker when it delivers the WhatsApp reply.
    // No duplicate creation here — doing so caused a race condition because:
    //   1. The guard checked existingMessage by the *customer's* messageId (never senderType='assistant')
    //   2. responseWorker concurrently creates the same record, resulting in duplicates.
    stepLogger.success({
      messageProcessed: true,
      stagesExecuted: result.stagesExecuted.length,
      cost: result.totalCost
    });
  } catch (error) {
    stepLogger.error(error as Error, { conversationId, messageId });
    throw error;
  }
}

/**
 * Polls a single input queue (text/audio/image) and runs the multi-stage
 * pipeline over the messages it pulls. Multiple instances run concurrently
 * via `loop()` below — one per configured queue.
 */
async function loopForQueue(textQueueUrl: string, sourceLabel: string) {
  logger.info({
    enableMultiStage: env.ENABLE_MULTI_STAGE_AI,
    rolloutPercentage: env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE,
    queueUrl: textQueueUrl,
    sourceLabel,
    nodeEnv: process.env.NODE_ENV
  }, 'Multi-Stage AI Worker queue poller started');

  while (true) {
    try {
      const messages = await receiveMessages(textQueueUrl, 10);
      
      if (messages.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before next poll
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
        const operationId = createOperationId('multi_stage_worker');
        const stepLogger = new StepLogger(operationId, 'Multi-Stage AI Worker', {
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
          
          const storedMessageIds: string[] = [];
          for (const { body } of conversationMessages) {
            const stored = await storeIncomingMessage(
              body.vendorId,
              body.customerPhone,
              body.content,
              body.phoneNumberId
            );
            if (stored.messageId) {
              storedMessageIds.push(stored.messageId);
            }
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
          
          // Check if should use multi-stage processing
          const useMultiStage = shouldUseMultiStage(conversationId);
          
          logger.info({
            conversationId,
            useMultiStage,
            enableMultiStage: env.ENABLE_MULTI_STAGE_AI,
            rolloutPercentage: env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE
          }, 'Feature flag check result');
          
          if (useMultiStage) {
            stepLogger.step('Using multi-stage AI processing', { conversationId });
            
            // Process single message (for now, batch processing can be added later)
            if (conversationMessages.length === 1) {
              const body = conversationMessages[0].body;
              body.messageId = storedMessageIds[0] || undefined;
              body.conversationId = conversationId;
              body.customerId = conversation.customerId;
              
              try {
                await processWithMultiStage(
                  body,
                  conversationId,
                  storedMessageIds[0],
                  conversation.customerId,
                  stepLogger
                );
                stepLogger.success({ processed: true, method: 'multi_stage' });
              } catch (processError) {
                stepLogger.error(processError as Error, { messageId: body.messageId });
                logger.error({ err: processError }, 'Multi-stage processing failed, falling back to legacy');
                
                // Fallback to legacy processing
                try {
                  await processIncomingTextMessage(body);
                  stepLogger.success({ processed: true, method: 'legacy_fallback' });
                } catch (fallbackError) {
                  stepLogger.error(fallbackError as Error, { messageId: body.messageId });
                  logger.error({ err: fallbackError }, 'Legacy fallback also failed');
                  // Don't delete message - let SQS retry
                  continue;
                }
              }
            } else {
              // Batch: merge all message content into one combined input so the
              // multi-stage pipeline has full context from every message in the batch.
              stepLogger.step('Batch processing - merging into multi-stage pipeline', { count: conversationMessages.length });

              const mergedContent = conversationMessages
                .map(({ body }) => body.content)
                .filter(Boolean)
                .join('\n');

              // Use the last message's ID as the anchor (most recent message in conversation)
              const lastBody = conversationMessages[conversationMessages.length - 1].body;
              const lastStoredId = storedMessageIds[storedMessageIds.length - 1];

              if (!lastStoredId) {
                // All storage calls failed — no valid messageId to anchor on; fall back to legacy
                stepLogger.warn('No stored message IDs available for batch merge, falling back to legacy batch');
                const messageDataArray = conversationMessages.map(({ body }) => ({
                  vendorId: body.vendorId,
                  customerPhone: body.customerPhone,
                  content: body.content,
                  phoneNumberId: body.phoneNumberId,
                  whatsappMessageId: body.whatsappMessageId,
                  timestamp: body.timestamp || new Date().toISOString()
                }));
                const { processBatchIncomingMessages } = await import('../services/messageProcessor.js');
                await processBatchIncomingMessages(messageDataArray);
                stepLogger.success({ processed: true, method: 'legacy_batch_no_ids' });
              } else {
              const mergedBody = {
                ...lastBody,
                content: mergedContent,
                messageId: lastStoredId,
                conversationId,
                customerId: conversation.customerId
              };

              try {
                await processWithMultiStage(
                  mergedBody,
                  conversationId,
                  lastStoredId,
                  conversation.customerId,
                  stepLogger
                );
                stepLogger.success({ processed: true, method: 'multi_stage_batch_merged', messageCount: conversationMessages.length });
              } catch (batchError) {
                stepLogger.error(batchError as Error, { messageCount: conversationMessages.length });
                logger.error({ err: batchError }, 'Multi-stage batch processing failed, falling back to legacy batch');

                const messageDataArray = conversationMessages.map(({ body }) => ({
                  vendorId: body.vendorId,
                  customerPhone: body.customerPhone,
                  content: body.content,
                  phoneNumberId: body.phoneNumberId,
                  whatsappMessageId: body.whatsappMessageId,
                  timestamp: body.timestamp || new Date().toISOString()
                }));

                const { processBatchIncomingMessages } = await import('../services/messageProcessor.js');
                await processBatchIncomingMessages(messageDataArray);
                stepLogger.success({ processed: true, method: 'legacy_batch_fallback' });
              }
              } // end else (lastStoredId exists)
            }
          } else {
            stepLogger.step('Using legacy AI processing', { conversationId });
            
            // Use legacy processing
            if (conversationMessages.length === 1) {
              const body = conversationMessages[0].body;
              body.messageId = storedMessageIds[0];
              body.conversationId = conversationId;
              body.customerId = conversation.customerId;
              
              try {
                await processIncomingTextMessage(body);
                stepLogger.success({ processed: true, method: 'legacy' });
              } catch (processError) {
                stepLogger.error(processError as Error, { messageId: body.messageId });
                logger.error({ err: processError }, 'Legacy processing failed');
                // Don't delete message - let SQS retry
                continue;
              }
            } else {
              // Batch processing
              stepLogger.step('Processing batch of messages', { count: conversationMessages.length });
              const messageDataArray = conversationMessages.map(({ body }, index) => ({
                vendorId: body.vendorId,
                customerPhone: body.customerPhone,
                content: body.content,
                phoneNumberId: body.phoneNumberId,
                whatsappMessageId: body.whatsappMessageId,
                timestamp: body.timestamp || new Date().toISOString()
              }));
              
              const { processBatchIncomingMessages } = await import('../services/messageProcessor.js');
              await processBatchIncomingMessages(messageDataArray);
              stepLogger.success({ processed: true, batchSize: conversationMessages.length });
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
          logger.error({ err, conversationKey: key }, 'Multi-stage AI worker failed for conversation');
          // Messages will remain in queue for retry
        }
      }
    } catch (err) {
      logger.error({ err }, 'Multi-stage AI worker loop error');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on error
    }
  }
}

/**
 * Top-level entry point. Spins up one poller per configured input queue.
 * The text queue is always required; audio and image queues are optional
 * and only polled when their URLs are configured.
 */
async function loop() {
  const inputs: Array<{ url: string; label: string }> = [
    { url: getTextQueueUrl(), label: 'text' }
  ];
  if (env.AUDIO_QUEUE_URL) {
    inputs.push({ url: env.AUDIO_QUEUE_URL, label: 'audio' });
  }
  if (env.IMAGE_QUEUE_URL) {
    inputs.push({ url: env.IMAGE_QUEUE_URL, label: 'image' });
  }

  logger.info({
    queueCount: inputs.length,
    sources: inputs.map((i) => i.label)
  }, 'Multi-Stage AI Worker starting pollers');

  await Promise.all(inputs.map((i) => loopForQueue(i.url, i.label)));
}

// Start the worker
loop().catch((err) => {
  logger.error({ err }, 'Multi-stage AI worker crashed');
  process.exit(1);
});

