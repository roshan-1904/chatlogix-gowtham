import type { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ensureConversation } from '../../services/messageProcessor.js';
import { logger, StepLogger, createOperationId } from '../../logger.js';
import { publishToQueue } from '../../queue/sqsClient.js';
import { env, getTextQueueUrl } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { logMessageToFile } from '../../services/webhookFallbackService.js';

/**
 * AWS Lambda handler for processing WhatsApp webhook events
 * Handles incoming messages and routes them to appropriate processing queues
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const operationId = createOperationId('lambda_webhook_handler');
  const stepLogger = new StepLogger(operationId, 'Lambda Webhook Handler', {
    httpMethod: event.httpMethod,
    path: event.path,
    userAgent: event.headers['User-Agent'] || 'unknown',
    sourceIp: event.requestContext.identity.sourceIp
  });

  try {
    stepLogger.step('Validating webhook request');
    
    // Handle GET request for webhook verification
    if (event.httpMethod === 'GET') {
      return await handleWebhookVerification(event, stepLogger);
    }

    // Handle POST request for incoming messages
    if (event.httpMethod === 'POST') {
      return await handleIncomingMessage(event, stepLogger);
    }

    stepLogger.warn('Unsupported HTTP method', { method: event.httpMethod });
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    stepLogger.error(error as Error, { 
      httpMethod: event.httpMethod,
      path: event.path,
      lambdaContext: {
        memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
        timeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT,
        region: process.env.AWS_REGION
      }
    });
    
    logger.error({ 
      error, 
      httpMethod: event.httpMethod,
      path: event.path
    }, 'Lambda webhook handler failed');
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

/**
 * Handle webhook verification (GET request)
 */
async function handleWebhookVerification(
  event: APIGatewayProxyEvent, 
  stepLogger: StepLogger
): Promise<APIGatewayProxyResult> {
  stepLogger.step('Processing webhook verification request');
  
  const queryParams = event.queryStringParameters || {};
  const mode = queryParams['hub.mode'];
  const token = queryParams['hub.verify_token'];
  const challenge = queryParams['hub.challenge'];

  stepLogger.step('Validating verification parameters', {
    hasMode: !!mode,
    hasToken: !!token,
    hasChallenge: !!challenge,
    expectedToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? '[SET]' : '[NOT_SET]'
  });

  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    stepLogger.success({ challenge });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain'
      },
      body: challenge || ''
    };
  }

  stepLogger.warn('Webhook verification failed', {
    mode,
    tokenProvided: !!token,
    tokenMatch: token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  });

  return {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ error: 'Forbidden' })
  };
}

/**
 * Handle incoming message (POST request)
 */
async function handleIncomingMessage(
  event: APIGatewayProxyEvent, 
  stepLogger: StepLogger
): Promise<APIGatewayProxyResult> {
  stepLogger.step('Processing incoming message');
  
  if (!event.body) {
    stepLogger.warn('Request body is empty');
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Request body is required' })
    };
  }

  stepLogger.step('Parsing webhook payload');
  const webhookData = JSON.parse(event.body);
  
  stepLogger.step('Validating webhook structure', {
    hasEntry: !!webhookData.entry,
    entryCount: webhookData.entry?.length || 0,
    hasChanges: webhookData.entry?.[0]?.changes?.length || 0
  });

  // Process each entry in the webhook
  const processingResults = [];
  
  for (const entry of webhookData.entry || []) {
    stepLogger.step('Processing webhook entry', {
      entryId: entry.id,
      changesCount: entry.changes?.length || 0
    });

    for (const change of entry.changes || []) {
      stepLogger.step('Processing change', {
        changeField: change.field,
        hasValue: !!change.value,
        messagesCount: change.value?.messages?.length || 0
      });

      if (change.field === 'messages' && change.value?.messages) {
        for (const message of change.value.messages) {
          try {
            const result = await processIncomingMessage(message, change.value.metadata, stepLogger);
            processingResults.push(result);
          } catch (error) {
            stepLogger.error(error as Error, { 
              messageId: message.id,
              messageType: message.type
            });
            processingResults.push({ 
              success: false, 
              messageId: message.id, 
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    }
  }

  const successful = processingResults.filter(r => r.success).length;
  const failed = processingResults.filter(r => !r.success).length;

  stepLogger.success({
    totalMessages: processingResults.length,
    successful,
    failed,
    successRate: processingResults.length > 0 ? `${((successful / processingResults.length) * 100).toFixed(2)}%` : '0%'
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Webhook processed successfully',
      processed: successful,
      failed,
      total: processingResults.length
    })
  };
}

/**
 * Process individual incoming message
 */
async function processIncomingMessage(
  message: any, 
  metadata: any, 
  stepLogger: StepLogger
): Promise<{ success: boolean; messageId: string; error?: string }> {
  const messageId = message.id;
  
  stepLogger.step('Processing individual message', {
    messageId,
    messageType: message.type,
    from: message.from,
    timestamp: message.timestamp
  });

  try {
    // Extract vendor ID from phone number ID in metadata
    const vendorId = metadata?.phone_number_id;
    if (!vendorId) {
      throw new Error('Vendor ID not found in metadata');
    }

    const customerPhone = message.from;
    if (!customerPhone) {
      throw new Error('Customer phone number not found');
    }

    stepLogger.step('Routing message to processing queue', {
      vendorId,
      customerPhone,
      messageType: message.type
    });

    // Route different message types to appropriate queues
    switch (message.type) {
      case 'text':
        stepLogger.step('Queuing text message immediately');
        
        // Try to queue immediately
        try {
          const messageData = {
            type: 'TextMessage',
            vendorId,
            customerPhone,
            content: message.text?.body || '',
            phoneNumberId: metadata?.phone_number_id || '',
            whatsappMessageId: messageId,
            timestamp: new Date().toISOString()
          };
          
          await publishToQueue(getTextQueueUrl(), messageData);
          stepLogger.step('Message queued successfully');
        } catch (queueError) {
          stepLogger.warn('Queue failed, attempting DB fallback', { error: queueError });
          
          // Fallback: Try to write to DB
          try {
            const { conversation } = await ensureConversation(vendorId, customerPhone);
            await prisma.message.create({
              data: { 
                conversationId: conversation.id, 
                senderType: 'customer', 
                content: message.text?.body || '', 
                type: 'text' 
              }
            });
            stepLogger.step('Message stored in DB (fallback)');
          } catch (dbError) {
            stepLogger.error(dbError as Error, { step: 'db_fallback_failed' });
            
            // Last resort: Write to log file
            try {
              await logMessageToFile({
                type: 'TextMessage',
                vendorId,
                customerPhone,
                content: message.text?.body || '',
                phoneNumberId: metadata?.phone_number_id || '',
                whatsappMessageId: messageId,
                timestamp: new Date().toISOString()
              });
              stepLogger.step('Message logged to file (fallback)');
            } catch (logError) {
              stepLogger.error(logError as Error, { step: 'log_file_fallback_failed' });
              throw new Error('All fallback mechanisms failed');
            }
          }
        }
        break;

      case 'audio':
      case 'image':
      default:
        stepLogger.warn('Unsupported message type', { 
          messageType: message.type,
          messageId 
        });
        return { success: false, messageId, error: `Unsupported message type: ${message.type}` };
    }

    stepLogger.step('Message routed successfully', { messageId, messageType: message.type });
    return { success: true, messageId };

  } catch (error) {
    stepLogger.error(error as Error, { messageId });
    return { 
      success: false, 
      messageId, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
