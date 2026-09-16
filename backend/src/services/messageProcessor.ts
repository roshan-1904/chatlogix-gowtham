import { prisma } from '../db/prisma.js';
import { AIService } from './aiService.js';
import { canProcessMessage } from './billingService.js';
import { chargeVendor, turnEstimateCost } from './pricing/pricingService.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { env, getTextQueueUrl } from '../config/env.js';
import { logger, StepLogger, createOperationId, logDbOperation, logAIOperation, logBillingOperation, logQueueOperation, logConversation, logErrorWithContext, logDatabaseFailure } from '../logger.js';
import { EventOrchestrator } from './eventProcessors/eventOrchestrator.js';
import { EventProcessingContext } from '../types/aiResponse.js';

const ai = new AIService();
const eventOrchestrator = new EventOrchestrator();

export async function ensureConversation(vendorId: string, customerPhone: string) {
  const operationId = createOperationId('ensure_conversation');
  const stepLogger = new StepLogger(operationId, 'Ensure Conversation', { vendorId, customerPhone });

  try {
    stepLogger.step('Upserting customer record');
    logDbOperation('upsert', 'customer', { phone: customerPhone });
    const customer = await prisma.customer.upsert({
      where: { phone: customerPhone },
      create: { phone: customerPhone },
      update: { lastInteraction: new Date() }
    });

    stepLogger.step('Finding existing open conversation');
    logDbOperation('findFirst', 'conversation', { vendorId, customerId: customer.id });
    let conversation = await prisma.conversation.findFirst({
      where: { vendorId, customerId: customer.id, status: 'open' },
      orderBy: { updatedAt: 'desc' }
    });

    if (!conversation) {
      stepLogger.step('Creating new conversation');
      logDbOperation('create', 'conversation', { vendorId, customerId: customer.id });
      conversation = await prisma.conversation.create({ data: { vendorId, customerId: customer.id } });
    } else {
      stepLogger.step('Found existing conversation', { conversationId: conversation.id });
    }

    stepLogger.success({ conversationId: conversation.id, customerId: customer.id });
    return { conversation, customer };
  } catch (error) {
    stepLogger.error(error as Error, { vendorId, customerPhone });
    throw error;
  }
}

export async function ensureCustomer(phone: string) {
  const operationId = createOperationId('ensure_customer');
  const stepLogger = new StepLogger(operationId, 'Ensure Customer', { phone });

  try {
    logDbOperation('upsert', 'customer', { phone });
    const customer = await prisma.customer.upsert({
      where: { phone },
      create: { phone },
      update: { lastInteraction: new Date() }
    });
    stepLogger.success({ customerId: customer.id });
    return customer;
  } catch (error) {
    stepLogger.error(error as Error, { phone });
    throw error;
  }
}

/**
 * Generate AI response using structured responses
 */
async function generateAIResponse(body: string, vendorId: string, conversationId: string) {
  logAIOperation('generate_structured_response', undefined, undefined, { messageLength: body.length, vendorId, conversationId });
  const aiResponse = await ai.generateStructuredResponse(body, vendorId, conversationId);
  return { content: aiResponse.customerMessage, aiResponse };
}

/**
 * Process AI events asynchronously without blocking the response
 */
function processEventsAsync(
  aiResponse: any,
  context: { conversationId: string; vendorId: string; customerId: string; messageId: string },
  logger: StepLogger
) {
  // Only process if there are events
  if (!(aiResponse?.orderUpdateEvent || aiResponse?.customerUpdateEvent)) {
    return;
  }

  logger.step('Processing AI events in parallel');
  const eventContext: EventProcessingContext = {
    conversationId: context.conversationId,
    vendorId: context.vendorId,
    customerId: context.customerId,
    messageId: context.messageId,
    timestamp: new Date()
  };

  eventOrchestrator.processAIResponse(aiResponse, eventContext)
    .then(result => {
      logger.step('Events processed', {
        success: result.success,
        eventsProcessed: result.eventsProcessed,
        duration: result.duration
      });
    })
    .catch(error => {
      logger.error(error as Error, { vendorId: context.vendorId, conversationId: context.conversationId });
    });
}

/**
 * Webhook handler: Store customer message and queue for processing
 * All heavy processing (credits, AI) happens in the incoming message worker
 */
export async function processTextMessage(vendorId: string, customerPhone: string, body: string, phoneNumberId?: string) {
  const operationId = createOperationId('webhook_text');
  const stepLogger = new StepLogger(operationId, 'Webhook Process Text', { vendorId, customerPhone, messageLength: body.length });

  try {
    // 1. Ensure conversation exists
    stepLogger.step('Ensuring conversation');
    const { conversation } = await ensureConversation(vendorId, customerPhone);

    // 2. Store incoming customer message
    stepLogger.step('Storing customer message');
    logDbOperation('create', 'message', { conversationId: conversation.id, senderType: 'customer', type: 'text' });
    logConversation('inbound', {
      conversationId: conversation.id,
      customerPhone,
      vendorId,
      content: body,
      messageType: 'text',
      status: 'received',
      metadata: { messageLength: body.length }
    });
    
    // Create message and update conversation's updatedAt in a transaction
    const [customerMessage] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId: conversation.id, senderType: 'customer', content: body, type: 'text' }
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      })
    ]);

    // 3. Check if AI is paused for this conversation
    stepLogger.step('Checking AI pause status');
    const conversationWithPause = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { aiPaused: true }
    });

    if (conversationWithPause?.aiPaused) {
      stepLogger.step('AI is paused - skipping queue', { conversationId: conversation.id });
      stepLogger.success({
        conversationId: conversation.id,
        messageId: customerMessage.id,
        queued: false,
        reason: 'ai_paused'
      });
      return; // Message is stored, but not queued for AI processing
    }

    // 4. Queue for processing (AI, credits happen in worker)
    stepLogger.step('Queuing for processing', { phoneNumberId });
    if (!phoneNumberId) {
      stepLogger.warn('⚠️ phoneNumberId is missing when queuing message - replies may use wrong number');
    }
    await publishToQueue(getTextQueueUrl(), {
      type: 'TextMessage',
      messageId: customerMessage.id,
      conversationId: conversation.id,
      vendorId,
      customerId: conversation.customerId,
      customerPhone,
      content: body,
      phoneNumberId
    });

    stepLogger.success({
      conversationId: conversation.id,
      messageId: customerMessage.id,
      queued: true
    });
  } catch (error) {
    stepLogger.error(error as Error, { vendorId, customerPhone, messageLength: body.length });
    throw error;
  }
}

/**
 * Store incoming message in database
 * Used by worker to store messages before processing
 */
export async function storeIncomingMessage(
  vendorId: string,
  customerPhone: string,
  content: string,
  phoneNumberId?: string
): Promise<{ conversationId: string; customerId: string; messageId?: string }> {
  const operationId = createOperationId('store_incoming_message');
  const stepLogger = new StepLogger(operationId, 'Store Incoming Message', { vendorId, customerPhone });

  try {
    // Ensure conversation exists
    stepLogger.step('Ensuring conversation');
    const { conversation } = await ensureConversation(vendorId, customerPhone);

    // Store incoming customer message
    stepLogger.step('Storing customer message');
    logDbOperation('create', 'message', { conversationId: conversation.id, senderType: 'customer', type: 'text' });
    logConversation('inbound', {
      conversationId: conversation.id,
      customerPhone,
      vendorId,
      content,
      messageType: 'text',
      status: 'received',
      metadata: { messageLength: content.length }
    });
    
    const customerMessage = await prisma.message.create({
      data: { conversationId: conversation.id, senderType: 'customer', content, type: 'text' }
    });

    stepLogger.success({
      conversationId: conversation.id,
      messageId: customerMessage.id,
      customerId: conversation.customerId
    });

    return {
      conversationId: conversation.id,
      customerId: conversation.customerId,
      messageId: customerMessage.id
    };
  } catch (error) {
    stepLogger.error(error as Error, { vendorId, customerPhone });
    throw error;
  }
}

/**
 * Check if AI is paused for a conversation
 */
export async function isAIPaused(conversationId: string): Promise<boolean> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { aiPaused: true }
    });
    return conversation?.aiPaused ?? false;
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Failed to check AI pause status');
    // Default to false if check fails to avoid blocking processing
    return false;
  }
}

/**
 * Process incoming text message (called by incoming message worker)
 * Handles credits, AI generation, and storing assistant response
 * Now handles cases where message may or may not already exist in DB
 */
export async function processIncomingTextMessage(data: any) {
  const operationId = createOperationId('process_incoming_text');
  const stepLogger = new StepLogger(operationId, 'Process Incoming Text', {
    messageId: data.messageId,
    conversationId: data.conversationId,
    vendorId: data.vendorId
  });

  try {
    // 0. Ensure message exists in DB (if messageId not provided, store it)
    if (!data.messageId && data.conversationId) {
      stepLogger.step('Message not in DB yet, storing it');
      const stored = await storeIncomingMessage(
        data.vendorId,
        data.customerPhone,
        data.content,
        data.phoneNumberId
      );
      data.messageId = stored.messageId;
      data.conversationId = stored.conversationId;
      data.customerId = stored.customerId;
    }

    // 1. Check if processing is allowed (credits)
    stepLogger.step('Checking billing');
    const allow = await canProcessMessage(data.vendorId, 'text');
    if (!allow.allowed) {
      stepLogger.warn('Processing blocked', { reason: allow.reason });
      return;
    }

    // 2. Charge the wallet. This legacy path debits *before* the AI call, so
    // the real token cost isn't known yet and the worst-case turn estimate is
    // charged instead. The production path (conversation/pipeline.ts) charges
    // actual cost after the reply is queued.
    stepLogger.step('Charging wallet');
    const charge = await chargeVendor({
      vendorId: data.vendorId,
      source: 'legacy_conversation_turn',
      cost: turnEstimateCost(),
      conversationId: data.conversationId,
      conversationType: 'text',
      metadata: { estimated: true, processor: 'legacy-express' }
    });
    logBillingOperation('charge_wallet', data.vendorId, charge.deductedMilli, { conversationId: data.conversationId, messageType: 'text' });

    // 3. Generate AI response
    stepLogger.step('Generating structured AI response');
    const { content: replyContent, aiResponse } = await generateAIResponse(data.content, data.vendorId, data.conversationId);

    // Log product recommendations if present
    if (aiResponse && aiResponse.productRecommendations && aiResponse.productRecommendations.length > 0) {
      logConversation('outbound', {
        conversationId: data.conversationId,
        customerPhone: data.customerPhone,
        vendorId: data.vendorId,
        content: `[RECOMMENDATIONS] ${aiResponse.productRecommendations.map((r: any) => r.product).join(', ')}`,
        messageType: 'system',
        status: 'recommendations',
        metadata: { recommendations: aiResponse.productRecommendations }
      });
    }

    // 4. Store AI response
    stepLogger.step('Storing assistant message');
    logDbOperation('create', 'message', { conversationId: data.conversationId, senderType: 'assistant', type: 'text', aiTokensUsed: aiResponse?.tokensUsed });
    const responseMessage = await prisma.message.create({
      data: { 
        conversationId: data.conversationId, 
        senderType: 'assistant', 
        content: replyContent, 
        type: 'text',
        aiTokensUsed: aiResponse?.tokensUsed || 0
      }
    });

    // 5. Queue for WhatsApp delivery
    // Fallback: If phoneNumberId is missing, try to retrieve it from database
    let phoneNumberId = data.phoneNumberId;
    if (!phoneNumberId && data.vendorId) {
      stepLogger.step('⚠️ phoneNumberId missing - attempting to retrieve from database', { vendorId: data.vendorId });
      try {
        const waNumber = await prisma.whatsAppNumber.findFirst({
          where: { vendorId: data.vendorId },
          orderBy: { createdAt: 'desc' }
        });
        if (waNumber) {
          phoneNumberId = waNumber.phoneNumberId;
          stepLogger.step('Retrieved phoneNumberId from database', { phoneNumberId });
        } else {
          stepLogger.warn('No WhatsApp number found for vendor', { vendorId: data.vendorId });
          logErrorWithContext(new Error('phoneNumberId missing and no fallback found'), {
            operationId,
            conversationId: data.conversationId,
            customerPhone: data.customerPhone,
            vendorId: data.vendorId,
            step: 'enqueue_response',
            additionalData: {
              hasPhoneNumberId: false,
              message: 'phoneNumberId missing and could not retrieve from database'
            }
          });
        }
      } catch (dbError) {
        stepLogger.error(dbError as Error, { step: 'retrieve_phoneNumberId_fallback' });
      }
    }
    
    stepLogger.step('Enqueuing for WhatsApp delivery', { 
      phoneNumberId,
      customerPhone: data.customerPhone,
      retrievedFromDb: !data.phoneNumberId && !!phoneNumberId
    });
    
    await publishToQueue(env.RESPONSE_QUEUE_URL, {
      type: 'text',
      to: data.customerPhone,
      text: responseMessage.content,
      conversationId: data.conversationId,
      vendorId: data.vendorId,
      customerId: data.customerId,
      messageId: responseMessage.id,
      aiTokensUsed: aiResponse?.tokensUsed,
      phoneNumberId
    });

    // 6. Process events asynchronously (non-blocking)
    processEventsAsync(aiResponse, {
      conversationId: data.conversationId,
      vendorId: data.vendorId,
      customerId: data.customerId,
      messageId: responseMessage.id
    }, stepLogger);

    stepLogger.success({
      conversationId: data.conversationId,
      replyLength: responseMessage.content.length,
      hasOrderEvent: !!aiResponse?.orderUpdateEvent,
      hasCustomerEvent: !!aiResponse?.customerUpdateEvent
    });
  } catch (error) {
    stepLogger.error(error as Error, { messageId: data.messageId, vendorId: data.vendorId });
    throw error;
  }
}

/**
 * Process batch of incoming text messages for the same conversation
 * Creates a single AI response for all messages
 */
export async function processBatchIncomingMessages(messages: Array<{
  vendorId: string;
  customerPhone: string;
  content: string;
  phoneNumberId?: string;
  whatsappMessageId?: string;
  timestamp: string;
}>): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  const operationId = createOperationId('process_batch_incoming');
  const stepLogger = new StepLogger(operationId, 'Process Batch Incoming Messages', {
    messageCount: messages.length,
    vendorId: messages[0].vendorId,
    customerPhone: messages[0].customerPhone
  });

  try {
    // 1. Store all messages in DB
    stepLogger.step('Storing all messages in database');
    const { conversation, customer } = await ensureConversation(messages[0].vendorId, messages[0].customerPhone);
    const conversationId = conversation.id;
    const customerId = customer.id;

    const storedMessages = [];
    for (const msg of messages) {
      logDbOperation('create', 'message', { conversationId, senderType: 'customer', type: 'text' });
      const customerMessage = await prisma.message.create({
        data: { conversationId, senderType: 'customer', content: msg.content, type: 'text' }
      });
      storedMessages.push(customerMessage);
      logConversation('inbound', {
        conversationId,
        customerPhone: msg.customerPhone,
        vendorId: msg.vendorId,
        content: msg.content,
        messageType: 'text',
        status: 'received'
      });
    }

    stepLogger.step(`Stored ${storedMessages.length} messages`);

    // 2. Check if processing is allowed (credits)
    stepLogger.step('Checking billing');
    const allow = await canProcessMessage(messages[0].vendorId, 'text');
    if (!allow.allowed) {
      stepLogger.warn('Processing blocked', { reason: allow.reason });
      return;
    }

    // 3. Charge once for the batch (see the note on the single-message path
    // above: pre-AI debit, so this is the worst-case turn estimate).
    stepLogger.step('Charging wallet for batch');
    const charge = await chargeVendor({
      vendorId: messages[0].vendorId,
      source: 'legacy_conversation_turn',
      cost: turnEstimateCost(),
      conversationId,
      conversationType: 'text',
      metadata: { estimated: true, processor: 'legacy-express', batchSize: messages.length }
    });
    logBillingOperation('charge_wallet', messages[0].vendorId, charge.deductedMilli, { conversationId, messageType: 'text', batchSize: messages.length });

    // 4. Combine message contents into single context
    stepLogger.step('Combining message contents');
    const combinedContent = messages.map(msg => msg.content).join('\n\n');

    // 5. Generate single AI response for the batch
    stepLogger.step('Generating structured AI response for batch');
    const { content: replyContent, aiResponse } = await generateAIResponse(combinedContent, messages[0].vendorId, conversationId);

    // Log product recommendations if present
    if (aiResponse && aiResponse.productRecommendations && aiResponse.productRecommendations.length > 0) {
      logConversation('outbound', {
        conversationId,
        customerPhone: messages[0].customerPhone,
        vendorId: messages[0].vendorId,
        content: `[RECOMMENDATIONS] ${aiResponse.productRecommendations.map((r: any) => r.product).join(', ')}`,
        messageType: 'system',
        status: 'recommendations',
        metadata: { recommendations: aiResponse.productRecommendations }
      });
    }

    // 6. Store single AI response
    stepLogger.step('Storing assistant message');
    logDbOperation('create', 'message', { conversationId, senderType: 'assistant', type: 'text', aiTokensUsed: aiResponse?.tokensUsed });
    const responseMessage = await prisma.message.create({
      data: { 
        conversationId, 
        senderType: 'assistant', 
        content: replyContent, 
        type: 'text',
        aiTokensUsed: aiResponse?.tokensUsed || 0
      }
    });

    // 7. Queue for WhatsApp delivery
    let phoneNumberId = messages[0].phoneNumberId;
    if (!phoneNumberId && messages[0].vendorId) {
      stepLogger.step('⚠️ phoneNumberId missing - attempting to retrieve from database', { vendorId: messages[0].vendorId });
      try {
        const waNumber = await prisma.whatsAppNumber.findFirst({
          where: { vendorId: messages[0].vendorId },
          orderBy: { createdAt: 'desc' }
        });
        if (waNumber) {
          phoneNumberId = waNumber.phoneNumberId;
          stepLogger.step('Retrieved phoneNumberId from database', { phoneNumberId });
        }
      } catch (dbError) {
        stepLogger.error(dbError as Error, { step: 'retrieve_phoneNumberId_fallback' });
      }
    }
    
    stepLogger.step('Enqueuing for WhatsApp delivery');
    await publishToQueue(env.RESPONSE_QUEUE_URL, {
      type: 'text',
      to: messages[0].customerPhone,
      text: responseMessage.content,
      conversationId,
      vendorId: messages[0].vendorId,
      customerId,
      messageId: responseMessage.id,
      aiTokensUsed: aiResponse?.tokensUsed,
      phoneNumberId
    });

    // 8. Process events asynchronously (non-blocking)
    processEventsAsync(aiResponse, {
      conversationId,
      vendorId: messages[0].vendorId,
      customerId,
      messageId: responseMessage.id
    }, stepLogger);

    stepLogger.success({
      conversationId,
      replyLength: responseMessage.content.length,
      messagesProcessed: messages.length,
      hasOrderEvent: !!aiResponse?.orderUpdateEvent,
      hasCustomerEvent: !!aiResponse?.customerUpdateEvent
    });
  } catch (error) {
    stepLogger.error(error as Error, { messageCount: messages.length, vendorId: messages[0]?.vendorId });
    throw error;
  }
}


