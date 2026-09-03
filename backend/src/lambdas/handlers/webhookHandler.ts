import type { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logger, StepLogger, createOperationId } from '../../logger.js';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { isValidWhatsAppSignature } from '../../utils/whatsappSignature.js';
import { parseWhatsAppEvents, ParsedWAEvent } from '../../services/waParser.js';
import { processWebhookEventBatch } from '../../services/webhookEventProcessor.js';

/**
 * AWS Lambda handler for processing WhatsApp webhook events
 * Handles incoming messages and routes them to appropriate processing queues
 */
// API Gateway HTTP APIs (payload format 2.0) don't populate the REST-API-shaped
// top-level `httpMethod` field — the method only lives at requestContext.http.method.
// Read both so this handler works regardless of which payload format is configured.
function getHttpMethod(event: APIGatewayProxyEvent): string | undefined {
  return event.httpMethod
    || (event.requestContext as unknown as { http?: { method?: string } })?.http?.method;
}

function getSourceIp(event: APIGatewayProxyEvent): string {
  return event.requestContext?.identity?.sourceIp
    || (event.requestContext as unknown as { http?: { sourceIp?: string } })?.http?.sourceIp
    || 'unknown';
}

function getHeader(event: APIGatewayProxyEvent, name: string): string | undefined {
  const headers = event.headers || {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const operationId = createOperationId('lambda_webhook_handler');
  const httpMethod = getHttpMethod(event);
  const stepLogger = new StepLogger(operationId, 'Lambda Webhook Handler', {
    httpMethod,
    path: event.path,
    userAgent: event.headers['User-Agent'] || event.headers['user-agent'] || 'unknown',
    sourceIp: getSourceIp(event)
  });

  try {
    stepLogger.step('Validating webhook request');

    // Handle GET request for webhook verification
    if (httpMethod === 'GET') {
      return await handleWebhookVerification(event, stepLogger);
    }

    // Handle POST request for incoming messages
    if (httpMethod === 'POST') {
      return await handleIncomingMessage(event, operationId, stepLogger);
    }

    stepLogger.warn('Unsupported HTTP method', { method: httpMethod });
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
      httpMethod,
      path: event.path,
      lambdaContext: {
        memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
        timeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT,
        region: process.env.AWS_REGION
      }
    });

    logger.error({
      error,
      httpMethod,
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
  operationId: string,
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

  const rawBody = Buffer.from(event.body, 'utf8');
  const signature = getHeader(event, 'x-hub-signature-256');

  stepLogger.step('Validating webhook signature', { signaturePresent: !!signature });

  if (env.WHATSAPP_APP_SECRET) {
    if (!isValidWhatsAppSignature(env.WHATSAPP_APP_SECRET, signature, rawBody)) {
      stepLogger.warn('Invalid WhatsApp signature');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }
  } else {
    stepLogger.warn('WHATSAPP_APP_SECRET not configured; skipping signature verification');
  }

  stepLogger.step('Parsing webhook payload');
  const webhookData = JSON.parse(event.body);

  let events: ParsedWAEvent[];
  try {
    events = parseWhatsAppEvents(webhookData);
  } catch (parseErr) {
    stepLogger.error(parseErr as Error, { step: 'parse_webhook_events' });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to parse webhook payload' })
    };
  }
  stepLogger.step(`Parsed ${events.length} events`);

  // Group events by phoneNumberId so we look up the vendor mapping once per number.
  const eventsByPhoneNumberId = new Map<string, ParsedWAEvent[]>();
  for (const ev of events) {
    if (!ev.phoneNumberId) {
      stepLogger.warn('Skipping event without phoneNumberId', { kind: ev.kind });
      continue;
    }
    const list = eventsByPhoneNumberId.get(ev.phoneNumberId) ?? [];
    list.push(ev);
    eventsByPhoneNumberId.set(ev.phoneNumberId, list);
  }

  let vendorsProcessed = 0;
  for (const [phoneNumberId, vendorEvents] of eventsByPhoneNumberId.entries()) {
    stepLogger.step('Looking up vendor mapping', { phoneNumberId });
    const mapping = await prisma.whatsAppNumber.findUnique({ where: { phoneNumberId } });
    if (!mapping) {
      stepLogger.warn('No vendor mapping found', { phoneNumberId });
      continue;
    }

    try {
      await processWebhookEventBatch(
        { vendorId: mapping.vendorId, phoneNumberId },
        vendorEvents,
        operationId,
        stepLogger
      );
      vendorsProcessed++;
    } catch (error) {
      stepLogger.error(error as Error, { phoneNumberId, vendorId: mapping.vendorId });
    }
  }

  stepLogger.success({
    totalEvents: events.length,
    vendorGroups: eventsByPhoneNumberId.size,
    vendorsProcessed
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Webhook processed successfully',
      totalEvents: events.length,
      vendorGroups: eventsByPhoneNumberId.size
    })
  };
}
