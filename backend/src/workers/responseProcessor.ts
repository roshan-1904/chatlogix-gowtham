import { logger, StepLogger, createOperationId, logWhatsAppOperation, logConversation, logErrorWithContext, logDatabaseFailure, logWhatsAppFailure } from '../logger.js';
import { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppImage, sendWhatsAppVideo } from '../services/whatsappClient.js';
import { uploadProductMediaForWhatsAppSend } from '../services/productMediaWhatsApp.js';
import { WhatsAppSendError } from '../services/whatsappSendErrors.js';
import {
  buildQuotedReplyFallbackBody,
  quotedReplyFallbackIntro
} from '../services/quotedReplyHelpers.js';
import { debitOutboundMessage } from '../conversation/billing.js';
import { logCount } from '../conversation/metrics.js';
import { AsyncDatabaseService } from '../services/asyncDatabaseService.js';
import { CustomerInsightsService } from '../services/customerInsightsService.js';
import { prisma } from '../db/prisma.js';

export type ResponseMediaAttachment = {
  messageId: string;
  productMediaId: string;
  kind: 'image' | 'video';
  caption?: string;
};

class OutboundMediaPartialFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundMediaPartialFailureError';
  }
}

export type ResponseQueueMessage =
  | {
      type: 'text';
      to: string;
      text: string;
      conversationId?: string;
      vendorId?: string;
      customerId?: string;
      messageId?: string;
      aiTokensUsed?: number;
      phoneNumberId?: string;
      replyToWhatsappMessageId?: string;
      replyToInternalMessageId?: string;
      fallbackQuestionText?: string;
      attachments?: ResponseMediaAttachment[];
      metadata?: Record<string, any>; // For tracking notification context
    }
  | {
      type: 'template';
      to: string;
      templateName: string;
      languageCode?: string;
      parameters: {
        body?: Array<{ type: 'text'; text: string }>;
        header?: Array<{ type: 'text' | 'image' | 'document'; text?: string; image?: { link: string }; document?: { link: string; filename: string } }>;
        buttons?: Array<{ type: 'url'; text: string; url: string }>;
      };
      vendorId?: string;
      customerId?: string;
      orderId?: string;
      notificationType?: 'order_status_update' | 'payment_link' | 'shipping_update' | 'custom_template';
      phoneNumberId?: string;
      metadata?: Record<string, any>; // For tracking notification context
    };

// Initialize insights service once
const insightsService = new CustomerInsightsService();

/**
 * Process a single response message: send to WhatsApp and persist to DB.
 * CRITICAL: WhatsApp message success ALWAYS triggers SQS message deletion.
 * Database operations are async and don't block message deletion.
 */
export async function processResponseMessage(body: ResponseQueueMessage, parentOperationId?: string): Promise<void> {
    const operationId = parentOperationId || createOperationId('response_processor');
    const stepLogger = new StepLogger(operationId, 'Response Processor', {
      messageType: body.type || 'text',
      hasTo: !!body?.to
    });

    if (!body?.to) {
      stepLogger.warn('Invalid payload: missing to');
      return;
    }

    // Validate message type
    if (body.type === 'text' && !('text' in body)) {
      stepLogger.warn('Invalid text message: missing text');
      return;
    }
    if (body.type === 'template' && !('templateName' in body)) {
      stepLogger.warn('Invalid template message: missing templateName');
      return;
    }

    try {
      let messageId: string;
      
      if (body.type === 'text' || !body.type) {
        // Handle text messages (backward compatible - default to text if type not specified)
        const textBody = body.type === 'text' ? body : body as { to: string; text: string; phoneNumberId?: string; conversationId?: string; vendorId?: string; customerId?: string; messageId?: string };

        if (!textBody.text) {
          stepLogger.warn('Invalid text message: missing text');
          return;
        }

        stepLogger.step('Sending WhatsApp text message', {
          to: body.to,
          textLength: textBody.text.length,
          phoneNumberId: textBody.phoneNumberId,
          hasPhoneNumberId: !!textBody.phoneNumberId,
          assistantMessageId: textBody.messageId
        });

        if (!textBody.phoneNumberId) {
          stepLogger.warn('⚠️ phoneNumberId missing in response message - will use default from env');
          logger.warn({
            operationId,
            conversationId: textBody.conversationId,
            customerPhone: body.to,
            vendorId: textBody.vendorId,
            issue: 'phoneNumberId_missing_in_response_queue'
          }, '⚠️ Response message missing phoneNumberId - replies may be sent from wrong number');
        }

        logWhatsAppOperation('send_text', textBody.phoneNumberId, body.to, {
          textLength: textBody.text.length,
          phoneNumberIdProvided: !!textBody.phoneNumberId
        });

        const quoteFields =
          body.type === 'text'
            ? {
                replyToWhatsappMessageId: body.replyToWhatsappMessageId,
                replyToInternalMessageId: body.replyToInternalMessageId,
                fallbackQuestionText: body.fallbackQuestionText
              }
            : {};

        let textSendResult: Awaited<ReturnType<typeof sendWhatsAppText>>;
        try {
          const { result, quoteApplied } = await sendTextWithQuoteFallback(
            body.to,
            textBody.text,
            textBody.phoneNumberId,
            textBody.messageId,
            quoteFields
          );
          textSendResult = result;
          stepLogger.step('WhatsApp text message sent successfully', {
            whatsappMessageId: textSendResult?.messageId,
            quoteApplied
          });

          if (textBody.messageId) {
            await markAssistantMessageSent(
              textBody.messageId,
              textSendResult?.messageId,
              quoteApplied ? quoteFields.replyToInternalMessageId : undefined
            ).catch(updateErr => {
              logger.warn({ err: updateErr, messageId: textBody.messageId }, 'Failed to mark assistant message as sent');
            });
          }
        } catch (sendErr) {
          if (textBody.messageId) {
            await markAssistantMessageFailed(
              textBody.messageId,
              sendErr instanceof Error ? sendErr.message : String(sendErr)
            ).catch(updateErr => {
              logger.warn({ err: updateErr, messageId: textBody.messageId }, 'Failed to mark assistant message as failed');
            });
          }
          throw sendErr;
        }
        
        // Update notification history if this is a notification text message
        if ('metadata' in body && body.metadata?.notificationId && body.metadata?.notificationType) {
          await updateNotificationHistory(
            body.metadata.notificationId,
            'sent',
            undefined, // No WhatsApp message ID for text messages
            textBody.vendorId,
            textBody.customerId
          ).catch(error => {
            logger.error({ error, notificationId: body.metadata?.notificationId }, 'Failed to update notification history');
          });
        }
        
        // Log outbound message
        logConversation('outbound', {
          conversationId: textBody.conversationId,
          customerPhone: body.to,
          vendorId: textBody.vendorId,
          content: textBody.text,
          messageType: 'text',
          status: 'sent',
          metadata: {
            textLength: textBody.text.length,
            hasConversationId: !!textBody.conversationId,
            hasVendorId: !!textBody.vendorId,
            hasCustomerId: !!textBody.customerId,
            isNotification: !!('metadata' in body && body.metadata?.notificationId)
          }
        });
        
        // STEP 2: Handle optional async operations (insights, etc.) for text messages
        // Skip insights for notification messages (they're not part of a conversation)
        if (textBody.conversationId && textBody.customerId && textBody.vendorId && !('metadata' in body && body.metadata?.notificationId)) {
          stepLogger.step('Initiating optional async operations (insights)');
          
          // Fire-and-forget: Don't await - let it run in background
          handleDatabaseOperationsAsync(textBody, operationId).catch(error => {
            logger.error({
              operationId,
              conversationId: textBody.conversationId,
              error: error instanceof Error ? error.message : String(error),
              asyncDbOperation: true
            }, '❌ Async insights update failed - logged to failure file');
          });
        }

        const attachments =
          body.type === 'text' && body.attachments?.length ? body.attachments : undefined;
        if (attachments) {
          const attachmentFailures = await processOutboundMediaAttachments({
            to: body.to,
            phoneNumberId: textBody.phoneNumberId,
            vendorId: textBody.vendorId,
            conversationId: textBody.conversationId,
            attachments,
            operationId,
            stepLogger
          });
          if (attachmentFailures.length > 0) {
            throw new OutboundMediaPartialFailureError(
              `Outbound media partial failure (${attachmentFailures.length}/${attachments.length}): ${attachmentFailures.join('; ')}`
            );
          }
        }
      } else if (body.type === 'template') {
        // Handle template messages
        stepLogger.step('Sending WhatsApp template message', {
          to: body.to,
          templateName: body.templateName,
          notificationType: body.notificationType,
          phoneNumberId: body.phoneNumberId
        });
        
        try {
          const result = await sendWhatsAppTemplate(
            body.to,
            body.templateName,
            body.languageCode || 'en',
            body.parameters,
            body.phoneNumberId
          );
          
          messageId = result.messageId;
          stepLogger.step('WhatsApp template message sent successfully', { messageId });
        } catch (templateError: any) {
          // If template doesn't exist (404), fallback to text message
          if (templateError?.message?.includes('does not exist') || templateError?.message?.includes('404')) {
            stepLogger.warn('Template does not exist, falling back to text message', {
              templateName: body.templateName,
              error: templateError.message 
            });
            
            // Build a text message from template parameters
            const textParts: string[] = [];
            
            // Add header text if available
            if (body.parameters.header && body.parameters.header.length > 0) {
              body.parameters.header.forEach((h: any) => {
                if (h.text) textParts.push(h.text);
              });
            }
            
            // Add body text
            if (body.parameters.body && body.parameters.body.length > 0) {
              body.parameters.body.forEach((b: any) => {
                if (b.text) textParts.push(b.text);
              });
            }
            
            // Add button URLs if available
            if (body.parameters.buttons && body.parameters.buttons.length > 0) {
              body.parameters.buttons.forEach((btn: any) => {
                if (btn.url) textParts.push(`${btn.text || 'Link'}: ${btn.url}`);
              });
            }
            
            const fallbackText = textParts.length > 0 
              ? textParts.join('\n')
              : `Order update: ${body.templateName}`;
            
            // Send as text message instead
            stepLogger.step('Sending fallback text message', { textLength: fallbackText.length });
            await sendWhatsAppText(body.to, fallbackText, body.phoneNumberId);
            messageId = 'fallback-text-' + Date.now();
            stepLogger.step('Fallback text message sent successfully', { messageId });
          } else {
            // Re-throw other errors
            throw templateError;
          }
        }
        
        // Log template message
        logWhatsAppOperation('send_template', body.phoneNumberId, body.to, {
          templateName: body.templateName,
          notificationType: body.notificationType,
          messageId
        });
        
        // Update notification history if orderId provided
        if (body.orderId && body.notificationType && body.metadata?.notificationId) {
          await updateNotificationHistory(
            body.metadata.notificationId,
            'sent',
            messageId,
            body.vendorId,
            body.customerId
          ).catch(error => {
            logger.error({ error, orderId: body.orderId, notificationId: body.metadata?.notificationId }, 'Failed to update notification history');
          });
        }
      } else {
        throw new Error(`Unknown message type: ${(body as any).type}`);
      }

      // STEP 3: Always mark as successful if WhatsApp message was sent
      stepLogger.success({ 
        to: body.to, 
        messageType: body.type || 'text',
        whatsappSent: true
      });
      

    } catch (err) {
      stepLogger.error(err as Error);

      if (err instanceof OutboundMediaPartialFailureError) {
        throw err;
      }
      
      // Enhanced error handling for notification messages (both template and text)
      if (('metadata' in body && body.metadata?.notificationId) || 
          (body.type === 'template' && 'orderId' in body && body.orderId && body.metadata?.notificationId)) {
        const notificationId = 'metadata' in body ? body.metadata?.notificationId : body.metadata?.notificationId;
        const vendorId = 'vendorId' in body ? body.vendorId : body.vendorId;
        const customerId = 'customerId' in body ? body.customerId : body.customerId;
        
        if (notificationId) {
          await updateNotificationHistory(
            notificationId,
            'failed',
            undefined,
            vendorId,
            customerId,
            err instanceof Error ? err.message : String(err)
          ).catch(error => {
            logger.error({ error }, 'Failed to update notification history on error');
          });
        }
      }
      
      // Enhanced error logging
      logErrorWithContext(err as Error, {
        operationId,
        conversationId: 'conversationId' in body ? body.conversationId : undefined,
        customerPhone: body.to,
        vendorId: 'vendorId' in body ? body.vendorId : undefined,
        step: body.type === 'template' ? 'whatsapp_template_send' : 'whatsapp_send',
        additionalData: {
          whatsappFailed: true,
          messageType: body.type || 'text',
          templateName: body.type === 'template' ? body.templateName : undefined
        }
      });
      
      if (body.type === 'template') {
        logWhatsAppFailure('send_template', err as Error, {
          to: body.to,
          templateName: body.templateName,
          notificationType: body.notificationType
        });
      } else {
        const textBody = body.type === 'text' ? body : body as { to: string; text?: string; conversationId?: string };
        logWhatsAppFailure('send_text', err as Error, {
          to: body.to,
          conversationId: textBody.conversationId,
          textLength: textBody.text?.length
        });
        
        // Log failed outbound message
        logConversation('outbound', {
          conversationId: textBody.conversationId,
          customerPhone: body.to,
          vendorId: 'vendorId' in body ? body.vendorId : undefined,
          content: textBody.text,
          messageType: 'text',
          status: 'failed',
          error: err as Error
        });
      }
      
      logger.error({ 
        err, 
        operationId,
        whatsappFailed: true,
        messageType: body.type || 'text'
      }, '❌ WhatsApp message sending failed');
      
      // Only throw if WhatsApp sending failed - this will trigger SQS retry
      throw err;
    }
  }

/**
 * Handle database operations asynchronously without blocking the response worker
 */
async function handleDatabaseOperationsAsync(body: { conversationId?: string; text?: string; vendorId?: string; customerId?: string }, operationId: string): Promise<void> {
    const { conversationId, text, vendorId, customerId } = body;

    try {
      // NOTE: Message record is already created in the webhook handler (messageProcessor.ts)
      // We don't need to create it again here. The response worker is only responsible for:
      // 1. Sending the WhatsApp message (already done)
      // 2. Updating customer insights (if applicable)
      

      // Update customer insights if customerId and vendorId are provided
      if (customerId && vendorId && text) {
        try {
          // Extract insights from the message content
          const insights = extractInsightsFromMessage(text);
          
          if (Object.keys(insights).length > 0) {
            await insightsService.updateInsights(customerId, vendorId, insights);
          }
        } catch (insightsError) {
          logger.error({
            operationId,
            error: insightsError instanceof Error ? insightsError.message : String(insightsError)
          }, '⚠️ Failed to update customer insights - non-critical');
        }
      }

    } catch (error) {
      const dbError = error instanceof Error ? error : new Error(String(error));
      
      // Enhanced database error logging
      logDatabaseFailure('async_message_operations', dbError, {
        operationId,
        conversationId,
        vendorId,
        customerId,
        messageContent: text?.substring(0, 100)
      });
      
      logErrorWithContext(dbError, {
        operationId,
        conversationId,
        customerPhone: undefined,
        vendorId,
        step: 'database_operations',
        additionalData: {
          asyncDbOperation: true,
          operation: 'insights_update'
        }
      });
      
      logger.error({
        operationId,
        conversationId,
        error: dbError.message,
        stack: dbError.stack,
        asyncDbOperation: true
      }, '❌ Async database operations failed');
      throw error;
    }
  }

/**
 * Send the outbound text, quoting the customer's message when a wamid is supplied.
 *
 * A second send only ever happens for a quote-specific Graph rejection
 * (`isInvalidQuoteContext`). Every other failure — 401, 429, 5xx, or a network
 * error that never produced a WhatsAppSendError — rethrows untouched so SQS
 * retries the original payload. Retrying unquoted on a generic failure risks a
 * duplicate customer message when Graph accepted the first request but we
 * failed to read the response.
 *
 * `quoteApplied` reports whether the delivered message actually carried
 * `context.message_id`, so the caller only stamps `Message.replyToMessageId`
 * when the customer really saw a quoted bubble.
 */
async function processOutboundMediaAttachments(ctx: {
  to: string;
  phoneNumberId?: string;
  vendorId?: string;
  conversationId?: string;
  attachments: ResponseMediaAttachment[];
  operationId: string;
  stepLogger: StepLogger;
}): Promise<string[]> {
  const failures: string[] = [];

  for (const attachment of ctx.attachments) {
    try {
      const existing = await prisma.message.findUnique({
        where: { id: attachment.messageId },
        select: { status: true }
      });
      if (existing?.status === 'sent') {
        ctx.stepLogger.step('Skipping outbound media — already sent', {
          messageId: attachment.messageId,
          productMediaId: attachment.productMediaId
        });
        continue;
      }

      const productMedia = await prisma.productMedia.findUnique({
        where: { id: attachment.productMediaId }
      });
      if (!productMedia || !productMedia.isActive) {
        const reason = !productMedia ? 'product_media_not_found' : 'product_media_inactive';
        await markAssistantMessageFailed(attachment.messageId, reason).catch(() => {});
        failures.push(`${attachment.messageId}: ${reason}`);
        continue;
      }
      if (ctx.vendorId && productMedia.vendorId !== ctx.vendorId) {
        const reason = 'product_media_vendor_mismatch';
        await markAssistantMessageFailed(attachment.messageId, reason).catch(() => {});
        failures.push(`${attachment.messageId}: ${reason}`);
        continue;
      }
      if (productMedia.kind !== attachment.kind) {
        const reason = 'product_media_kind_mismatch';
        await markAssistantMessageFailed(attachment.messageId, reason).catch(() => {});
        failures.push(`${attachment.messageId}: ${reason}`);
        continue;
      }

      const graphMediaId = await uploadProductMediaForWhatsAppSend(
        productMedia,
        ctx.phoneNumberId ?? ''
      );
      const mediaInput = {
        to: ctx.to,
        mediaId: graphMediaId,
        phoneNumberId: ctx.phoneNumberId,
        caption: attachment.caption
      };

      ctx.stepLogger.step('Sending WhatsApp media attachment', {
        messageId: attachment.messageId,
        kind: attachment.kind,
        productMediaId: attachment.productMediaId,
        phoneNumberId: ctx.phoneNumberId
      });

      logWhatsAppOperation(
        attachment.kind === 'video' ? 'send_video' : 'send_image',
        ctx.phoneNumberId,
        ctx.to,
        { productMediaId: attachment.productMediaId, assistantMessageId: attachment.messageId }
      );

      const sendResult =
        attachment.kind === 'video'
          ? await sendWhatsAppVideo(mediaInput)
          : await sendWhatsAppImage(mediaInput);

      await markAssistantMessageSent(attachment.messageId, sendResult?.messageId).catch(updateErr => {
        logger.warn(
          { err: updateErr, messageId: attachment.messageId },
          'Failed to mark media attachment message as sent'
        );
      });

      try {
        await debitOutboundMessage(attachment.messageId);
      } catch (debitErr) {
        logger.error(
          { err: debitErr, messageId: attachment.messageId, kind: attachment.kind },
          'Outbound media debit failed after successful send'
        );
        logCount('DebitFail', { vendorId: ctx.vendorId, context: 'outbound_media' });
      }

      logConversation('outbound', {
        conversationId: ctx.conversationId,
        customerPhone: ctx.to,
        vendorId: ctx.vendorId,
        content: attachment.caption ?? `[${attachment.kind}]`,
        messageType: attachment.kind,
        status: 'sent',
        metadata: {
          productMediaId: attachment.productMediaId,
          assistantMessageId: attachment.messageId
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markAssistantMessageFailed(attachment.messageId, message).catch(() => {});
      failures.push(`${attachment.messageId}: ${message}`);
      logWhatsAppFailure(
        attachment.kind === 'video' ? 'send_video' : 'send_image',
        err as Error,
        {
          to: ctx.to,
          conversationId: ctx.conversationId,
          productMediaId: attachment.productMediaId
        }
      );
      logConversation('outbound', {
        conversationId: ctx.conversationId,
        customerPhone: ctx.to,
        vendorId: ctx.vendorId,
        content: attachment.caption ?? `[${attachment.kind}]`,
        messageType: attachment.kind,
        status: 'failed',
        error: err as Error
      });
      logger.error(
        {
          err,
          operationId: ctx.operationId,
          messageId: attachment.messageId,
          productMediaId: attachment.productMediaId
        },
        'Outbound product media send failed'
      );
    }
  }

  return failures;
}

async function sendTextWithQuoteFallback(
  to: string,
  text: string,
  phoneNumberId?: string,
  outboundMessageId?: string,
  quote?: {
    replyToWhatsappMessageId?: string;
    replyToInternalMessageId?: string;
    fallbackQuestionText?: string;
  }
): Promise<{ result: Awaited<ReturnType<typeof sendWhatsAppText>>; quoteApplied: boolean }> {
  const wamid = quote?.replyToWhatsappMessageId;
  if (!wamid) {
    return { result: await sendWhatsAppText(to, text, phoneNumberId), quoteApplied: false };
  }

  try {
    const result = await sendWhatsAppText(to, text, phoneNumberId, {
      replyToWhatsappMessageId: wamid
    });
    logCount('CustomerQueryReplyQuoted', {});
    return { result, quoteApplied: true };
  } catch (sendErr) {
    const isQuoteError =
      sendErr instanceof WhatsAppSendError &&
      sendErr.isInvalidQuoteContext &&
      !!quote?.fallbackQuestionText?.trim();
    if (!isQuoteError) {
      throw sendErr;
    }

    const fallbackBody = buildQuotedReplyFallbackBody(
      quotedReplyFallbackIntro(),
      quote.fallbackQuestionText!,
      text
    );
    if (outboundMessageId) {
      await prisma.message.update({
        where: { id: outboundMessageId },
        data: { content: fallbackBody }
      });
    }
    logCount('CustomerQueryReplyFallback', {});
    return {
      result: await sendWhatsAppText(to, fallbackBody, phoneNumberId),
      quoteApplied: false
    };
  }
}

/**
 * Update an assistant Message row with the WhatsApp messageId returned by Send,
 * and bump status to 'sent'. Idempotent — re-runs simply re-write the same fields.
 */
async function markAssistantMessageSent(
  messageId: string,
  whatsappMessageId?: string,
  replyToInternalMessageId?: string
): Promise<void> {
  try {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'sent',
        ...(whatsappMessageId ? { whatsappMessageId } : {}),
        ...(replyToInternalMessageId ? { replyToMessageId: replyToInternalMessageId } : {})
      }
    });
  } catch (err: any) {
    // P2002 = unique violation on whatsappMessageId — happens if a status webhook
    // raced ahead and stamped the same id elsewhere. Treat as success.
    if (err?.code !== 'P2002') {
      throw err;
    }
  }
}

/**
 * Mark an assistant Message row as failed and record the failure reason.
 */
async function markAssistantMessageFailed(messageId: string, failureReason: string): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: {
      status: 'failed',
      failureReason: failureReason.slice(0, 500)
    }
  });
}

/**
 * Update notification history after sending
 */
async function updateNotificationHistory(
  notificationId: string,
  status: 'sent' | 'failed',
  whatsappMessageId?: string,
  vendorId?: string,
  customerId?: string,
  errorMessage?: string
): Promise<void> {
  try {
    await prisma.notificationHistory.update({
      where: { id: notificationId },
      data: {
        status: status === 'sent' ? 'sent' : 'failed',
        whatsappMessageId,
        errorMessage,
        sentAt: status === 'sent' ? new Date() : undefined,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    logger.error({ error, notificationId }, 'Failed to update notification history');
  }
}

/**
 * Extract customer insights from message content
 */
function extractInsightsFromMessage(text: string): any {
    const insights: any = {};
    
    // Extract delivery address (look for address patterns)
    const addressPattern = /(?:address|location|deliver to|send to)[\s:]+([^.!?\n]+)/i;
    const addressMatch = text.match(addressPattern);
    if (addressMatch && addressMatch[1]) {
      insights.deliveryAddress = addressMatch[1].trim();
    }

    // Extract delivery instructions
    const instructionsPattern = /(?:instruction|note|note:|please)[\s:]+([^.!?\n]+)/i;
    const instructionsMatch = text.match(instructionsPattern);
    if (instructionsMatch && instructionsMatch[1]) {
      insights.deliveryInstructions = instructionsMatch[1].trim();
    }

    // Extract special requests
    const specialPattern = /(?:special|request|requirement)[\s:]+([^.!?\n]+)/i;
    const specialMatch = text.match(specialPattern);
    if (specialMatch && specialMatch[1]) {
      insights.specialRequests = specialMatch[1].trim();
    }

    return insights;
  }


