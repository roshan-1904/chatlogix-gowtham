/**
 * Multi-Stage AI Worker Detailed Logging Service
 * 
 * Creates one detailed log file per message with comprehensive stage data:
 * - Step-by-step function calls
 * - Data passed in each stage
 * - AI prompts prepared
 * - AI responses received
 * - Decisions made
 * - All data retrieved and updated from database
 * 
 * Reference: Multi-Stage AI Worker Logging Requirements
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { StageContext } from '../types/multiStage.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';

// Per-message multi-stage JSON logs are the largest disk consumer.
// Gated behind ENABLE_MULTI_STAGE_LOGS (default: OFF). Flip on temporarily to debug.
const isMultiStageLoggingEnabled = env.ENABLE_MULTI_STAGE_LOGS === 'true';

// Ensure logs directory exists (only when logging is enabled)
const logsDir = join(process.cwd(), 'logs', 'multi-stage');
if (isMultiStageLoggingEnabled && !existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

interface StageLogEntry {
  stage: string;
  stageNumber: string;
  timestamp: string;
  duration: number;
  functionCall: string;
  inputData: any;
  outputData: any;
  aiPrompt?: string;
  aiResponse?: any;
  decision?: {
    type: string;
    reason: string;
    outcome: any;
  };
  databaseOperations?: {
    reads: Array<{
      table: string;
      query: string;
      filters?: any;
      resultCount?: number;
      data?: any;
    }>;
    writes: Array<{
      table: string;
      operation: 'create' | 'update' | 'delete' | 'upsert';
      data?: any;
      where?: any;
      result?: any;
    }>;
  };
  tokensUsed?: number;
  cost?: number;
  success: boolean;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  fallbackUsed?: boolean;
}

interface MessageLog {
  messageId: string;
  conversationId: string;
  vendorId: string;
  customerId: string;
  rawMessage: string;
  startTime: string;
  endTime?: string;
  totalDuration?: number;
  stages: StageLogEntry[];
  summary: {
    stagesExecuted: string[];
    stagesSkipped: string[];
    totalTokensUsed: number;
    totalCost: number;
    errors: number;
    fallbacksUsed: number;
  };
  finalMessage?: string;
  finalIntent?: string;
  extractedData?: any;
}

class MultiStageLogger {
  private logData: MessageLog;
  private logFilePath: string;

  constructor(context: StageContext) {
    this.logData = {
      messageId: context.messageId,
      conversationId: context.conversationId,
      vendorId: context.vendorId,
      customerId: context.customerId,
      rawMessage: context.rawMessage,
      startTime: new Date().toISOString(),
      stages: [],
      summary: {
        stagesExecuted: [],
        stagesSkipped: [],
        totalTokensUsed: 0,
        totalCost: 0,
        errors: 0,
        fallbacksUsed: 0
      }
    };

    // Short-circuit: skip filesystem work entirely when disabled
    if (!isMultiStageLoggingEnabled) {
      this.logFilePath = '';
      return;
    }

    // Create log file path: logs/multi-stage/YYYY-MM-DD/{time}_messageId.json
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dateDir = join(logsDir, today);
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }

    // Format time as 12-hour format with AM/PM (e.g., "11-59PM")
    // Use dash instead of colon for Windows filename compatibility
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12; // Convert to 12-hour format
    const timeString = `${displayHours}-${String(minutes).padStart(2, '0')}${ampm}`;

    const fileName = `${timeString}_${context.messageId}.json`;
    this.logFilePath = join(dateDir, fileName);
  }

  /**
   * Log a stage execution with all details
   */
  logStage(
    stageName: string,
    stageNumber: string,
    functionCall: string,
    inputData: any,
    outputData: any,
    duration: number,
    options?: {
      aiPrompt?: string;
      aiResponse?: any;
      decision?: {
        type: string;
        reason: string;
        outcome: any;
      };
      databaseReads?: Array<{
        table: string;
        query: string;
        filters?: any;
        resultCount?: number;
        data?: any;
      }>;
      databaseWrites?: Array<{
        table: string;
        operation: 'create' | 'update' | 'delete' | 'upsert';
        data?: any;
        where?: any;
        result?: any;
      }>;
      tokensUsed?: number;
      cost?: number;
      success?: boolean;
      error?: Error;
      fallbackUsed?: boolean;
    }
  ): void {
    // When disabled, still track lightweight summary counters (tokens/cost/errors)
    // so that downstream code relying on summary is accurate — but skip all
    // expensive sanitization and stage-entry construction.
    if (!isMultiStageLoggingEnabled) {
      if (options?.error) this.logData.summary.errors++;
      if (options?.fallbackUsed) this.logData.summary.fallbacksUsed++;
      if (options?.tokensUsed) this.logData.summary.totalTokensUsed += options.tokensUsed;
      if (options?.cost) this.logData.summary.totalCost += options.cost;
      return;
    }

    const entry: StageLogEntry = {
      stage: stageName,
      stageNumber,
      timestamp: new Date().toISOString(),
      duration,
      functionCall,
      inputData: this.sanitizeData(inputData),
      outputData: this.sanitizeData(outputData),
      success: options?.success !== false,
      tokensUsed: options?.tokensUsed,
      cost: options?.cost,
      fallbackUsed: options?.fallbackUsed
    };

    if (options?.aiPrompt) {
      entry.aiPrompt = options.aiPrompt;
    }

    if (options?.aiResponse) {
      entry.aiResponse = this.sanitizeData(options.aiResponse);
    }

    if (options?.decision) {
      entry.decision = options.decision;
    }

    if (options?.databaseReads || options?.databaseWrites) {
      entry.databaseOperations = {
        reads: options.databaseReads || [],
        writes: options.databaseWrites || []
      };
    }

    if (options?.error) {
      entry.error = {
        type: options.error.constructor.name,
        message: options.error.message,
        stack: options.error.stack
      };
      this.logData.summary.errors++;
    }

    if (options?.fallbackUsed) {
      this.logData.summary.fallbacksUsed++;
    }

    if (options?.tokensUsed) {
      this.logData.summary.totalTokensUsed += options.tokensUsed;
    }

    if (options?.cost) {
      this.logData.summary.totalCost += options.cost;
    }

    this.logData.stages.push(entry);
  }

  /**
   * Log a skipped stage
   */
  logSkippedStage(stageName: string, reason: string): void {
    this.logData.summary.stagesSkipped.push(stageName);
    this.logStage(
      stageName,
      this.getStageNumber(stageName),
      'SKIPPED',
      { reason },
      { skipped: true },
      0,
      {
        success: true,
        decision: {
          type: 'skip',
          reason,
          outcome: 'stage_skipped'
        }
      }
    );
  }

  /**
   * Log final results
   */
  logFinalResult(
    finalMessage: string,
    intent: string,
    extractedData: any,
    stagesExecuted: string[],
    stagesSkipped: string[]
  ): void {
    this.logData.endTime = new Date().toISOString();
    this.logData.totalDuration = Date.now() - new Date(this.logData.startTime).getTime();
    this.logData.finalMessage = finalMessage;
    this.logData.finalIntent = intent;
    this.logData.extractedData = this.sanitizeData(extractedData);
    this.logData.summary.stagesExecuted = stagesExecuted;
    this.logData.summary.stagesSkipped = stagesSkipped;
  }

  /**
   * Save log to file
   */
  save(): void {
    if (!isMultiStageLoggingEnabled) return;
    try {
      const logContent = JSON.stringify(this.logData, null, 2);
      appendFileSync(this.logFilePath, logContent + '\n', { encoding: 'utf8' });
    } catch (error) {
      logger.error({ err: error, messageId: this.logData.messageId }, 'Failed to save multi-stage log');
    }
  }

  /**
   * Get current log data (for inspection)
   */
  getLogData(): MessageLog {
    return this.logData;
  }

  /**
   * Sanitize sensitive data
   */
  private sanitizeData(data: any): any {
    if (!data) return data;
    
    // Create a deep copy to avoid mutating original
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization'];
    
    const sanitizeObject = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }
      
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
            result[key] = '[REDACTED]';
          } else {
            result[key] = sanitizeObject(value);
          }
        }
        return result;
      }
      
      return obj;
    };
    
    return sanitizeObject(sanitized);
  }

  /**
   * Get stage number from stage name
   */
  private getStageNumber(stageName: string): string {
    const stageMap: Record<string, string> = {
      'stage_0': '0',
      'stage_0.5': '0.5',
      'stage_1': '1',
      'stage_1.5': '1.5',
      'stage_1.7': '1.7',
      'stage_2': '2',
      'stage_3': '3',
      'stage_4': '4',
      'stage_4.5': '4.5',
      'stage_4.7': '4.7',
      'stage_5': '5',
      'stage_6': '6',
      'stage_7': '7',
      'stage_7.5': '7.5',
      'stage_8': '8',
      'stage_8.5': '8.5',
      'stage_9': '9'
    };
    return stageMap[stageName] || stageName;
  }
}

// Singleton instance per message
const loggerInstances = new Map<string, MultiStageLogger>();

/**
 * Get or create logger instance for a message
 */
export function getMultiStageLogger(context: StageContext): MultiStageLogger {
  const key = context.messageId;
  if (!loggerInstances.has(key)) {
    loggerInstances.set(key, new MultiStageLogger(context));
  }
  return loggerInstances.get(key)!;
}

/**
 * Clean up logger instance after message processing
 */
export function cleanupLogger(messageId: string): void {
  const logger = loggerInstances.get(messageId);
  if (logger) {
    logger.save();
    loggerInstances.delete(messageId);
  }
}

/**
 * Helper to log database read operation
 */
export function logDatabaseRead(
  logger: MultiStageLogger,
  table: string,
  query: string,
  filters?: any,
  resultCount?: number,
  data?: any
): void {
  // This will be called from the orchestrator when database reads occur
  // The actual logging happens in the stage log entry
}

/**
 * Helper to log database write operation
 */
export function logDatabaseWrite(
  logger: MultiStageLogger,
  table: string,
  operation: 'create' | 'update' | 'delete' | 'upsert',
  data?: any,
  where?: any,
  result?: any
): void {
  // This will be called from the orchestrator when database writes occur
  // The actual logging happens in the stage log entry
}
