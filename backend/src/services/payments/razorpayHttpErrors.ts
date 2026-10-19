import { createError, CustomError, ErrorSeverity, ErrorType } from '../../middleware/errorHandler.js';
import { logger } from '../../logger.js';

/** Fields Razorpay returns in `error` for most REST failures. */
export interface ParsedRazorpayError {
  code?: string;
  description?: string;
  source?: string;
  step?: string;
  reason?: string;
  field?: string;
  metadata?: Record<string, unknown>;
}

export function parseRazorpayErrorBody(raw: string): ParsedRazorpayError | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const json = JSON.parse(trimmed) as { error?: ParsedRazorpayError };
    if (!json.error || typeof json.error !== 'object') return null;
    return json.error;
  } catch {
    return null;
  }
}

function isRouteAccessDenied(parsed: ParsedRazorpayError | null): boolean {
  return parsed?.description === 'Access Denied' && parsed?.source === 'gateway';
}

function httpStatusForRazorpayFailure(httpStatus: number, parsed: ParsedRazorpayError | null): number {
  if (httpStatus === 401 || httpStatus === 403) return 502;
  if (httpStatus === 400 && isRouteAccessDenied(parsed)) return 503;
  if (httpStatus >= 400 && httpStatus < 500) return 502;
  if (httpStatus >= 500) return 502;
  return 502;
}

function userMessageForRazorpayFailure(
  operation: string,
  httpStatus: number,
  parsed: ParsedRazorpayError | null
): string {
  if (isRouteAccessDenied(parsed)) {
    return 'Razorpay Route is not enabled on this merchant account. Contact ChatLogix support.';
  }
  if (parsed?.description) {
    return `Razorpay ${operation} failed: ${parsed.description}`;
  }
  return `Razorpay ${operation} failed (HTTP ${httpStatus})`;
}

export type RazorpayHttpErrorContext = Record<string, unknown>;

/**
 * Structured payment-provider error log + operational AppError for API routes.
 * Never log secrets; pass only safe identifiers in logContext.
 */
export function throwRazorpayHttpError(input: {
  operation: string;
  httpStatus: number;
  rawBody: string;
  method?: string;
  path?: string;
  logContext?: RazorpayHttpErrorContext;
}): never {
  const parsed = parseRazorpayErrorBody(input.rawBody);
  const statusCode = httpStatusForRazorpayFailure(input.httpStatus, parsed);

  logger.error(
    {
      paymentProvider: 'razorpay',
      paymentOperation: input.operation,
      httpMethod: input.method,
      httpPath: input.path,
      httpStatus: input.httpStatus,
      razorpayErrorCode: parsed?.code,
      razorpayDescription: parsed?.description,
      razorpaySource: parsed?.source,
      razorpayStep: parsed?.step,
      razorpayReason: parsed?.reason,
      razorpayField: parsed?.field,
      razorpayMetadata: parsed?.metadata,
      rawBodySnippet: input.rawBody.slice(0, 2000),
      routeAccessDenied: isRouteAccessDenied(parsed),
      ...input.logContext
    },
    `Razorpay HTTP error during ${input.operation}`
  );

  const err = createError(
    userMessageForRazorpayFailure(input.operation, input.httpStatus, parsed),
    statusCode,
    ErrorType.PAYMENT,
    statusCode === 503 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
    {
      paymentProvider: 'razorpay',
      operation: input.operation,
      httpStatus: input.httpStatus,
      razorpay: parsed,
      routeNotEnabled: isRouteAccessDenied(parsed) || undefined
    }
  );
  throw err;
}

export async function readRazorpayErrorBody(res: Response): Promise<string> {
  return res.text().catch(() => '');
}

export function isPaymentAppError(error: unknown): error is CustomError {
  return error instanceof CustomError && error.errorType === ErrorType.PAYMENT;
}
