import pino from 'pino';
import { createWriteStream, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './config/env.js';

const isFileLoggingEnabled = env.ENABLE_FILE_LOGS === 'true';
const isConversationLoggingEnabled = env.ENABLE_CONVERSATION_LOGS === 'true';
const logsDir = join(process.cwd(), 'logs');

if (isFileLoggingEnabled && !existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Create date-based log file name
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const logFileName = `app-${today}.log`;
const errorLogFileName = `error-${today}.log`;
const conversationLogFileName = `conversation-${today}.log`;

let logStream: ReturnType<typeof createWriteStream> | null = null;
let errorStream: ReturnType<typeof createWriteStream> | null = null;
let conversationStream: ReturnType<typeof createWriteStream> | null = null;

if (isFileLoggingEnabled) {
  logStream = createWriteStream(join(logsDir, logFileName), { flags: 'a' });
  errorStream = createWriteStream(join(logsDir, errorLogFileName), { flags: 'a' });
  conversationStream = createWriteStream(join(logsDir, conversationLogFileName), { flags: 'a' });
}

// Base logger configuration
const baseConfig = {
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
};

// Logger configuration with file transports
const loggerStreams: pino.StreamEntry[] = [{ stream: process.stdout }];
if (logStream) {
  loggerStreams.push({ stream: logStream });
}
if (errorStream) {
  loggerStreams.push({ level: 'error', stream: errorStream });
}

const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
}, pino.multistream(loggerStreams));

export { logger };

// Enhanced logger with step tracking
export class StepLogger {
  private stepCounter: number = 0;
  private readonly operationId: string;
  private readonly startTime: number;

  constructor(operationId: string, operation: string, context?: Record<string, any>) {
    this.operationId = operationId;
    this.startTime = Date.now();
    this.stepCounter = 0;
    logger.info({ operationId, operation, context }, `▶ ${operation}`);
  }

  step(stepName: string, data?: Record<string, any>, level: 'info' | 'warn' | 'error' = 'info') {
    this.stepCounter++;
    const elapsed = Date.now() - this.startTime;
    const logData = {
      operationId: this.operationId,
      step: `STEP_${this.stepCounter}`,
      stepName,
      elapsedMs: elapsed,
      data,
    };
    if (level === 'error') {
      logger.error(logData, `❌ Step ${this.stepCounter}: ${stepName}`);
    } else if (level === 'warn') {
      logger.warn(logData, `⚠️ Step ${this.stepCounter}: ${stepName}`);
    } else {
      logger.info(logData, `Step ${this.stepCounter}: ${stepName}`);
    }
  }

  success(result?: Record<string, any>) {
    const elapsed = Date.now() - this.startTime;
    logger.info({ operationId: this.operationId, step: 'SUCCESS', elapsedMs: elapsed, result }, `✅ ${this.operationId} succeeded`);
  }

  error(error: Error | string, context?: Record<string, any>) {
    const elapsed = Date.now() - this.startTime;
    const errorData = typeof error === 'string' ? { message: error } : error;
    
    logger.error({
      operationId: this.operationId,
      step: 'ERROR',
      elapsedMs: elapsed,
      error: errorData,
      context,
      timestamp: new Date().toISOString(),
    }, `❌ Operation failed: ${this.operationId}`);
  }

  warn(message: string, data?: Record<string, any>) {
    const elapsed = Date.now() - this.startTime;
    logger.warn({
      operationId: this.operationId,
      step: 'WARN',
      elapsedMs: elapsed,
      data,
      timestamp: new Date().toISOString(),
    }, `⚠️ Warning: ${message}`);
  }
}

// Utility function to create operation IDs
export function createOperationId(prefix: string = 'op'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

// Request logging middleware
export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const operationId = createOperationId('req');
    req.operationId = operationId;
    next();
  };
}

// Database operation logger (disabled to reduce log volume)
export function logDbOperation(operation: string, table: string, data?: any) {
  // Logging disabled to save server space - keeping only error and conversation logs
}

// Queue operation logger (disabled to reduce log volume)
export function logQueueOperation(operation: string, queueUrl: string, messageType?: string, data?: any) {
  // Logging disabled to save server space - keeping only error and conversation logs
}

// WhatsApp operation logger (disabled to reduce log volume)
export function logWhatsAppOperation(operation: string, phoneNumberId?: string, customerPhone?: string, data?: any) {
  // Logging disabled to save server space - keeping only error and conversation logs
}

// AI operation logger (disabled to reduce log volume)
export function logAIOperation(operation: string, intent?: string, tokensUsed?: number, data?: any) {
  // Logging disabled to save server space - keeping only error and conversation logs
}

// Billing operation logger (disabled to reduce log volume)
export function logBillingOperation(operation: string, vendorId: string, amount?: number, data?: any) {
  // Logging disabled to save server space - keeping only error and conversation logs
}

// NEW: Conversation logger for tracking message flow
export function logConversation(direction: 'inbound' | 'outbound', data: {
  conversationId?: string;
  customerPhone?: string;
  vendorId?: string;
  messageId?: string;
  content?: string;
  messageType?: string;
  status?: string;
  error?: Error | string;
  metadata?: Record<string, any>;
}) {
  if (!isConversationLoggingEnabled) {
    return;
  }

  const logEntry = {
    direction,
    timestamp: new Date().toISOString(),
    ...data,
    error: data.error instanceof Error ? {
      message: data.error.message,
      stack: data.error.stack,
      name: data.error.name
    } : data.error
  };

  const prefix = direction === 'inbound' ? 'INCOMING' : 'OUTGOING';
  
  const logString = JSON.stringify({
    type: 'conversation',
    prefix,
    ...logEntry
  }) + '\n';

  // Per-customer/vendor monthly file: logs/conversations/YYYY-MM/{vendorId}/{customerPhone}.log
  try {
    if (!isFileLoggingEnabled) {
      return;
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const vendorId = (data.vendorId || 'unknown_vendor').toString();
    const phone = (data.customerPhone || 'unknown_phone').toString();
    const convoDir = join(logsDir, 'conversations', yearMonth, vendorId);
    if (!existsSync(convoDir)) {
      mkdirSync(convoDir, { recursive: true });
    }
    const convoFile = join(convoDir, `${phone}.log`);
    appendFileSync(convoFile, logString, { encoding: 'utf8' });
  } catch (error) {
    // Fallback to global conversation stream if per-entity logging fails
    conversationStream?.write(logString);
    logger.error({ error }, 'Failed to write conversation log file');
  }

  // Note: Conversation logs are written to dedicated conversation files above
  // Disabling general logger.info to avoid duplication and save server space
}

// NEW: Enhanced error logger with context
export function logErrorWithContext(error: Error, context: {
  operationId?: string;
  conversationId?: string;
  customerPhone?: string;
  vendorId?: string;
  step?: string;
  additionalData?: Record<string, any>;
}) {
  const errorLog = {
    type: 'error',
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context,
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage()
    }
  };

  const logString = JSON.stringify(errorLog) + '\n';
  errorStream?.write(logString);
  
  logger.error({
    ...errorLog,
    err: error
  }, `❌ ERROR: ${error.message}`);
}

// NEW: Database failure logger
export function logDatabaseFailure(operation: string, error: Error, context?: Record<string, any>) {
  logErrorWithContext(error, {
    operationId: createOperationId('db_fail'),
    step: operation,
    additionalData: context
  });
}

// NEW: Queue failure logger
export function logQueueFailure(operation: string, error: Error, context?: Record<string, any>) {
  logErrorWithContext(error, {
    operationId: createOperationId('queue_fail'),
    step: operation,
    additionalData: context
  });
}

// NEW: WhatsApp failure logger
export function logWhatsAppFailure(operation: string, error: Error, context?: Record<string, any>) {
  logErrorWithContext(error, {
    operationId: createOperationId('wa_fail'),
    step: operation,
    additionalData: context
  });
}