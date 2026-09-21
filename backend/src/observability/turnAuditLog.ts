import { logger } from '../logger.js';
import { isVendorFlagOn } from '../config/featureFlags.js';

export const TURN_AUDIT_FLAG = 'conversation_turn_audit';

const MAX_AUDIT_BYTES = 200 * 1024;

export type TurnAuditService =
  | 'webhook-handler'
  | 'incoming-response-generator'
  | 'whatsapp-response-dispatcher'
  | 'chatlogix-backend';

export interface TurnAuditContext {
  traceId: string;
  vendorId?: string;
  conversationId?: string;
  service: TurnAuditService;
}

export async function isTurnAuditEnabled(vendorId: string): Promise<boolean> {
  if (!vendorId) return false;
  return isVendorFlagOn(vendorId, TURN_AUDIT_FLAG);
}

/** Map Lambda function name (or local Express) to the service label in audit envelopes. */
export function turnAuditServiceFromRuntime(): TurnAuditService {
  const fn = process.env.AWS_LAMBDA_FUNCTION_NAME ?? '';
  if (fn.includes('webhook-handler')) return 'webhook-handler';
  if (fn.includes('incoming-response-generator')) return 'incoming-response-generator';
  if (fn.includes('whatsapp-response-dispatcher') || fn.includes('response-processor')) {
    return 'whatsapp-response-dispatcher';
  }
  return 'chatlogix-backend';
}

function byteLengthUtf8(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function serializePayload(payload: unknown): string {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function truncatePayloadJson(serialized: string): Record<string, unknown> {
  const originalBytes = byteLengthUtf8(serialized);
  if (originalBytes <= MAX_AUDIT_BYTES) {
    return JSON.parse(serialized) as Record<string, unknown>;
  }

  const buf = Buffer.from(serialized, 'utf8');
  const kept = buf.subarray(0, MAX_AUDIT_BYTES).toString('utf8');
  let parsed: unknown = kept;
  try {
    parsed = JSON.parse(kept);
  } catch {
    parsed = { preview: kept };
  }

  return {
    truncated: true,
    originalBytes,
    keptBytes: byteLengthUtf8(kept),
    payload: parsed
  };
}

/**
 * Sync structured audit log for CloudWatch Insights. No-op when `enabled` is false.
 * Large payloads are truncated at ~200KB with `truncated` markers.
 */
export function logTurnAudit(
  enabled: boolean,
  ctx: TurnAuditContext,
  checkpoint: string,
  payload: unknown
): void {
  if (!enabled || !ctx.traceId) return;

  const serialized = serializePayload(payload);
  const originalBytes = byteLengthUtf8(serialized);

  if (originalBytes <= MAX_AUDIT_BYTES) {
    logger.info(
      {
        turnAudit: true,
        schema: 'turn_audit_v1',
        checkpoint,
        traceId: ctx.traceId,
        vendorId: ctx.vendorId,
        conversationId: ctx.conversationId,
        service: ctx.service,
        payload: JSON.parse(serialized)
      },
      'turn_audit'
    );
    return;
  }

  const partSize = MAX_AUDIT_BYTES;
  const buf = Buffer.from(serialized, 'utf8');
  const partCount = Math.ceil(buf.length / partSize);

  for (let i = 0; i < partCount; i++) {
    const slice = buf.subarray(i * partSize, (i + 1) * partSize).toString('utf8');
    let partPayload: unknown;
    try {
      partPayload = JSON.parse(slice);
    } catch {
      partPayload = { preview: slice };
    }

    logger.info(
      {
        turnAudit: true,
        schema: 'turn_audit_v1',
        checkpoint: `${checkpoint}_part_${i + 1}`,
        traceId: ctx.traceId,
        vendorId: ctx.vendorId,
        conversationId: ctx.conversationId,
        service: ctx.service,
        truncated: true,
        originalBytes,
        keptBytes: byteLengthUtf8(slice),
        partIndex: i + 1,
        partCount,
        payload: partPayload
      },
      'turn_audit'
    );
  }
}
