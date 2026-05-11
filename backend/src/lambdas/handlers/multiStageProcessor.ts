import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { env } from '../../config/env.js';
import { logger, StepLogger, createOperationId } from '../../logger.js';
import { MultiStageOrchestrator } from '../../services/multiStageOrchestrator.js';
import { processIncomingTextMessage, ensureConversation, storeIncomingMessage, isAIPaused } from '../../services/messageProcessor.js';
import { StageContext } from '../../types/multiStage.js';

/**
 * AWS Lambda handler for processing incoming messages through multi-stage AI pipeline
 * This replaces the standalone multi-stage worker with a serverless solution
 */

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
    
    // Store assistant message if not already stored
    const { prisma } = await import('../../db/prisma.js');
    const existingMessage = await prisma.message.findUnique({
      where: { id: messageId }
    });
    
    if (existingMessage?.senderType !== 'assistant') {
      await prisma.message.create({
        data: {
          conversationId,
          senderType: 'assistant',
          content: result.finalMessage,
          type: 'text',
          aiTokensUsed: result.totalTokensUsed
        }
      });
    }
    
    // Response is already queued in Stage 9
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
 * Process a conversation group of messages
 */
async function processConversationGroup(
  conversationMessages: Array<{ record: SQSRecord; body: any }>,
  stepLogger: StepLogger
): Promise<{ success: boolean; reason?: string }> {
  try {
    const firstMessage = conversationMessages[0].body;
    
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
      return { success: true, reason: 'ai_paused' };
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
      
      // Process single message
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
            throw fallbackError;
          }
        }
      } else {
        // Batch processing - use legacy for now
        stepLogger.step('Batch processing - using legacy method', { count: conversationMessages.length });
        const messageDataArray = conversationMessages.map(({ body }) => ({
          vendorId: body.vendorId,
          customerPhone: body.customerPhone,
          content: body.content,
          phoneNumberId: body.phoneNumberId,
          whatsappMessageId: body.whatsappMessageId,
          timestamp: body.timestamp || new Date().toISOString()
        }));
        
        const { processBatchIncomingMessages } = await import('../../services/messageProcessor.js');
        await processBatchIncomingMessages(messageDataArray);
        stepLogger.success({ processed: true, method: 'legacy_batch' });
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
          throw processError;
        }
      } else {
        // Batch processing
        stepLogger.step('Processing batch of messages', { count: conversationMessages.length });
        const messageDataArray = conversationMessages.map(({ body }) => ({
          vendorId: body.vendorId,
          customerPhone: body.customerPhone,
          content: body.content,
          phoneNumberId: body.phoneNumberId,
          whatsappMessageId: body.whatsappMessageId,
          timestamp: body.timestamp || new Date().toISOString()
        }));
        
        const { processBatchIncomingMessages } = await import('../../services/messageProcessor.js');
        await processBatchIncomingMessages(messageDataArray);
        stepLogger.success({ processed: true, batchSize: conversationMessages.length });
      }
    }
    
    stepLogger.success({ processed: true, messageDeleted: true });
    return { success: true };
  } catch (err) {
    stepLogger.error(err as Error, { conversationKey: conversationMessages[0]?.body?.vendorId });
    logger.error({ err }, 'Multi-stage AI processor failed for conversation');
    return { success: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * AWS Lambda handler
 */
export const handler = async (event: SQSEvent): Promise<void> => {
  const batchOperationId = createOperationId('lambda_multi_stage_processor_batch');
  const batchLogger = new StepLogger(batchOperationId, 'Lambda Multi-Stage Processor Batch', {
    records: event.Records.length,
    environment: process.env.NODE_ENV || 'production'
  });

  try {
    batchLogger.step('Starting batch processing', { 
      recordCount: event.Records.length,
      lambdaMemory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
      lambdaTimeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT,
      enableMultiStage: env.ENABLE_MULTI_STAGE_AI,
      rolloutPercentage: env.MULTI_STAGE_AI_ROLLOUT_PERCENTAGE
    });

    // Group messages by conversation (vendorId + customerPhone)
    const messagesByConversation = new Map<string, Array<{ record: SQSRecord; body: any }>>();
    
    for (const record of event.Records) {
      if (!record.body) {
        continue;
      }
      
      try {
        const body = JSON.parse(record.body);
        if (body.type === 'TextMessage') {
          const key = `${body.vendorId}-${body.customerPhone}`;
          if (!messagesByConversation.has(key)) {
            messagesByConversation.set(key, []);
          }
          messagesByConversation.get(key)!.push({ record, body });
        }
      } catch (parseError) {
        logger.warn({ error: parseError, messageId: record.messageId }, 'Failed to parse message body');
      }
    }

    // Process each conversation group
    const results = await Promise.allSettled(
      Array.from(messagesByConversation.entries()).map(async ([key, conversationMessages]) => {
        const operationId = createOperationId('lambda_multi_stage_processor');
        const stepLogger = new StepLogger(operationId, 'Lambda Multi-Stage Processor', {
          conversationKey: key,
          messageCount: conversationMessages.length,
          vendorId: conversationMessages[0].body.vendorId,
          customerPhone: conversationMessages[0].body.customerPhone
        });

        return await processConversationGroup(conversationMessages, stepLogger);
      })
    );

    // Analyze results
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));

    batchLogger.step('Batch processing completed', {
      totalConversations: messagesByConversation.size,
      successful: successful.length,
      failed: failed.length,
      successRate: `${((successful.length / messagesByConversation.size) * 100).toFixed(2)}%`
    });

    // Log failed records for debugging
    if (failed.length > 0) {
      batchLogger.warn('Some conversations failed processing', {
        failedCount: failed.length,
        failedConversations: failed.map(f => ({
          status: f.status,
          reason: f.status === 'fulfilled' ? f.value.reason : 'promise_rejected',
          error: f.status === 'rejected' ? (f.reason instanceof Error ? f.reason.message : String(f.reason)) : undefined
        }))
      });
    }

    // If all conversations failed, throw an error to trigger retry
    if (failed.length === messagesByConversation.size && messagesByConversation.size > 0) {
      throw new Error(`All ${messagesByConversation.size} conversations failed processing`);
    }

    batchLogger.success({ 
      processed: successful.length,
      failed: failed.length,
      totalConversations: messagesByConversation.size
    });

    return;

  } catch (error) {
    batchLogger.error(error as Error, { 
      totalRecords: event.Records.length,
      lambdaContext: {
        memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
        timeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT,
        region: process.env.AWS_REGION
      }
    });
    
    logger.error({ 
      error, 
      totalRecords: event.Records.length 
    }, 'Lambda multi-stage processor batch failed');
    
    throw error;
  }
};
