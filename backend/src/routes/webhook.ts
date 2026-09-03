import express from 'express';
import { env, getTextQueueUrl } from '../config/env.js';
import { logger, StepLogger, createOperationId, logWhatsAppOperation } from '../logger.js';
import { isValidWhatsAppSignature } from '../utils/whatsappSignature.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { parseWhatsAppEvents, ParsedWAEvent, MessageCreatedEvent } from '../services/waParser.js';
import { prisma } from '../db/prisma.js';
import { ensureConversation } from '../services/messageProcessor.js';
import { DuplicateMessageService } from '../services/duplicateMessageService.js';
import { logMessageToFile } from '../services/webhookFallbackService.js';
import { isVendorFlagOn } from '../config/featureFlags.js';
import { processWebhookEventBatch } from '../services/webhookEventProcessor.js';
import { emitMetric } from '../observability/metrics.js';

export const webhookRouter = express.Router();

const PARITY_FLAG = 'whatsapp_conversation_parity';

// Raw body parser for webhook (needed for signature verification)
webhookRouter.use(express.raw({ type: 'application/json' }));

// GET for verification
webhookRouter.get('/', (req, res) => {
  const stepLogger = new StepLogger(createOperationId('webhook_verify'), 'Webhook Verification', {
    mode: req.query['hub.mode'],
    token: req.query['hub.verify_token'] ? '[REDACTED]' : undefined,
    challenge: req.query['hub.challenge']
  });

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  stepLogger.step('Validating verification parameters');

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    stepLogger.step('Verification successful');
    stepLogger.success({ mode, challenge });
    return res.status(200).send(challenge);
  }

  stepLogger.error('Verification failed - invalid token or mode', { mode, tokenProvided: !!token });
  return res.sendStatus(403);
});

// POST for events - must use raw body for signature
webhookRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const operationId = createOperationId('webhook_event');
  const stepLogger = new StepLogger(operationId, 'Webhook Event Processing', {
    bodySize: req.body?.length || 0,
    signature: req.header('x-hub-signature-256') ? '[PRESENT]' : '[MISSING]'
  });

  try {
    const rawBody = req.body as Buffer;
    const signature = req.header('x-hub-signature-256');
    const bypass = env.DISABLE_WEBHOOK_SIGNATURE === 'true' && env.NODE_ENV !== 'production';

    stepLogger.step('Validating webhook signature');

    if (!bypass && !isValidWhatsAppSignature(env.WHATSAPP_APP_SECRET, signature, rawBody)) {
      stepLogger.error('Invalid WhatsApp signature', { bypass, signaturePresent: !!signature });
      return res.sendStatus(401);
    }

    stepLogger.step('Parsing webhook payload');
    const payload = JSON.parse(rawBody.toString('utf8'));
    res.sendStatus(200);

    let events: ParsedWAEvent[];
    try {
      events = parseWhatsAppEvents(payload);
    } catch (parseErr) {
      emitMetric('webhook.parse_failure');
      throw parseErr;
    }
    emitMetric('webhook.events_received', events.length);
    stepLogger.step(`Parsed ${events.length} events`);

    // Group events by phoneNumberId so we look up the vendor mapping & flag once per number.
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

    for (const [phoneNumberId, vendorEvents] of eventsByPhoneNumberId.entries()) {
      stepLogger.step('Looking up vendor mapping', { phoneNumberId });
      const map = await prisma.whatsAppNumber.findUnique({ where: { phoneNumberId } });
      if (!map) {
        stepLogger.warn('No vendor mapping found', { phoneNumberId });
        continue;
      }

      const parityOn = await isVendorFlagOn(map.vendorId, PARITY_FLAG);
      stepLogger.step('Resolved per-vendor parity flag', {
        vendorId: map.vendorId,
        parityOn
      });

      if (parityOn) {
        await runParityPipeline(
          { vendorId: map.vendorId, phoneNumberId },
          vendorEvents,
          operationId,
          stepLogger
        );
      } else {
        await runLegacyPipeline(
          { vendorId: map.vendorId, phoneNumberId },
          vendorEvents,
          stepLogger
        );
      }
    }

    stepLogger.success({ eventCount: events.length });
  } catch (err) {
    stepLogger.error(err as Error, { errorType: 'webhook_processing_error' });
    logger.error({ err }, 'Webhook processing failed');
    if (!res.headersSent) {
      res.sendStatus(200);
    }
  }
});

async function runParityPipeline(
  vendor: { vendorId: string; phoneNumberId: string },
  events: ParsedWAEvent[],
  parentOperationId: string,
  stepLogger: StepLogger
): Promise<void> {
  await processWebhookEventBatch(vendor, events, parentOperationId, stepLogger);
}

// ---------------------------------------------------------------------------
// Legacy ingestion path — preserved for vendors without the parity flag.
// Mirrors the prior text-only behavior so existing rollouts stay unchanged
// until they're explicitly opted into the new pipeline.
// ---------------------------------------------------------------------------

async function runLegacyPipeline(
  vendor: { vendorId: string; phoneNumberId: string },
  events: ParsedWAEvent[],
  stepLogger: StepLogger
): Promise<void> {
  const messageEvents = events.filter(
    (e): e is MessageCreatedEvent => e.kind === 'message_created'
  );

  for (const msg of messageEvents) {
    if (msg.whatsappMessageId && DuplicateMessageService.isDuplicate(msg.whatsappMessageId)) {
      stepLogger.warn('Skipping duplicate message', {
        whatsappMessageId: msg.whatsappMessageId,
        customerPhone: msg.from,
        messageType: msg.messageType
      });
      logWhatsAppOperation('duplicate_skipped', vendor.phoneNumberId, msg.from, {
        vendorId: vendor.vendorId,
        whatsappMessageId: msg.whatsappMessageId
      });
      continue;
    }

    if (msg.messageType === 'text' && msg.text) {
      stepLogger.step('Queuing text message immediately');
      try {
        const messageData = {
          type: 'TextMessage',
          vendorId: vendor.vendorId,
          customerPhone: msg.from,
          content: msg.text,
          phoneNumberId: vendor.phoneNumberId,
          whatsappMessageId: msg.whatsappMessageId,
          timestamp: new Date().toISOString()
        };
        await publishToQueue(getTextQueueUrl(), messageData);
        logWhatsAppOperation('text_queued', vendor.phoneNumberId, msg.from, {
          vendorId: vendor.vendorId
        });
      } catch (queueError) {
        stepLogger.warn('Queue failed, attempting DB fallback', { error: queueError });
        try {
          const { conversation } = await ensureConversation(vendor.vendorId, msg.from);
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              senderType: 'customer',
              content: msg.text,
              type: 'text'
            }
          });
          logWhatsAppOperation('text_stored_db_fallback', vendor.phoneNumberId, msg.from, {
            vendorId: vendor.vendorId
          });
        } catch (dbError) {
          stepLogger.error(dbError as Error, { step: 'db_fallback_failed' });
          try {
            await logMessageToFile({
              type: 'TextMessage',
              vendorId: vendor.vendorId,
              customerPhone: msg.from,
              content: msg.text,
              phoneNumberId: vendor.phoneNumberId,
              whatsappMessageId: msg.whatsappMessageId,
              timestamp: new Date().toISOString()
            });
            logWhatsAppOperation('text_logged_file_fallback', vendor.phoneNumberId, msg.from, {
              vendorId: vendor.vendorId
            });
          } catch (logError) {
            stepLogger.error(logError as Error, { step: 'log_file_fallback_failed' });
            logger.error(
              { err: logError, vendorId: vendor.vendorId, customerPhone: msg.from },
              'All fallback mechanisms failed'
            );
          }
        }
      }
    } else if (
      msg.messageType === 'audio' ||
      msg.messageType === 'image' ||
      msg.messageType === 'document'
    ) {
      stepLogger.step('Skipping unsupported message type');
      logWhatsAppOperation('message_skipped', vendor.phoneNumberId, msg.from, {
        vendorId: vendor.vendorId,
        messageType: msg.messageType
      });
    } else {
      stepLogger.step('Enqueuing other message type');
      await publishToQueue(getTextQueueUrl(), {
        type: 'CustomerMessageReceived',
        vendorId: vendor.vendorId,
        message: msg
      });
      logWhatsAppOperation('other_enqueued', vendor.phoneNumberId, msg.from, {
        vendorId: vendor.vendorId,
        messageType: msg.messageType
      });
    }
  }
}
