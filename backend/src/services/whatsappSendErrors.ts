/**
 * Graph API send failures with parsed error metadata.
 * Invalid quote context: typically subcode 2593006 or message mentioning context / message not found.
 */
export class WhatsAppSendError extends Error {
  readonly status: number;
  readonly graphCode?: number;
  readonly graphSubcode?: number;
  readonly isInvalidQuoteContext: boolean;

  constructor(
    message: string,
    status: number,
    options?: { graphCode?: number; graphSubcode?: number; isInvalidQuoteContext?: boolean }
  ) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.status = status;
    this.graphCode = options?.graphCode;
    this.graphSubcode = options?.graphSubcode;
    this.isInvalidQuoteContext = options?.isInvalidQuoteContext ?? false;
  }
}

export function parseGraphErrorBody(raw: string): {
  graphCode?: number;
  graphSubcode?: number;
  message?: string;
} {
  try {
    const json = JSON.parse(raw) as { error?: { code?: number; error_subcode?: number; message?: string } };
    return {
      graphCode: json.error?.code,
      graphSubcode: json.error?.error_subcode,
      message: json.error?.message
    };
  } catch {
    return {};
  }
}

/**
 * Quote-context Graph failures. Live 2026-09-20/21 (vendor quoted replies):
 * `{ error: { message: "(#100) Invalid parameter", code: 100 } }` — no
 * `error_subcode`. Subcode 2593006 is the documented Cloud API variant.
 */
export function isInvalidQuoteContextError(
  status: number,
  graphCode?: number,
  graphSubcode?: number,
  message?: string
): boolean {
  if (graphSubcode === 2593006) return true;
  const lower = (message ?? '').toLowerCase();
  if (lower.includes('context') && lower.includes('message')) return true;
  if (lower.includes('message not found')) return true;
  if (status === 400 && graphCode === 100 && lower.includes('parameter')) return true;
  return false;
}
