import type { SQSHandler, SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { logger } from '../logger.js';
import { processMessage } from './pipeline.js';

interface TextMessagePayload {
  type: string;
  vendorId?: string | null;
  customerPhone: string;
  content: string;
  phoneNumberId: string;
  whatsappMessageId: string;
  /** Set by mediaFetchProcessor when the TextMessage is a voice/image caption handoff. */
  sourceMessageType?: string;
}

/**
 * SQS batch handler implementing ReportBatchItemFailures (spec §7 step 0,
 * §25). Deliberately does NOT copy `multiStageProcessor.ts`'s pattern —
 * that handler implements zero ReportBatchItemFailures anywhere (confirmed
 * by repo-wide grep) and is all-or-nothing via `Promise.allSettled` +
 * throw-if-all-failed, with all pipeline logic inline in the handler file.
 * This handler stays thin: parse each record, delegate to
 * pipeline.processMessage, collect per-record failures. All step 0-11 logic
 * lives in pipeline.ts.
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body) as TextMessagePayload;
      if (body.type !== 'TextMessage') {
        continue; // non-TextMessage payloads are ignored rather than failed
      }

      const sourceMessageType =
        body.sourceMessageType === 'audio' || body.sourceMessageType === 'image'
          ? body.sourceMessageType
          : undefined;

      await processMessage({
        vendorId: body.vendorId,
        phoneNumberId: body.phoneNumberId,
        customerPhone: body.customerPhone,
        content: body.content,
        whatsappMessageId: body.whatsappMessageId,
        ...(sourceMessageType ? { sourceMessageType } : {})
      });
    } catch (error) {
      logger.error({ err: error, messageId: record.messageId }, 'conversationProcessor: record failed, will retry via SQS');
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
