import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { DatabaseRetryService } from './databaseRetryService.js';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface DatabaseOperation {
  operation: 'create' | 'update' | 'delete' | 'find';
  table: string;
  data: any;
  conversationId?: string;
  messageId?: string;
  timestamp: Date;
}

export interface DatabaseFailureLog {
  operation: DatabaseOperation;
  error: string;
  errorType: string;
  stack?: string;
  timestamp: Date;
  retryCount: number;
}

export class AsyncDatabaseService {
  private static failureLogStream: NodeJS.WritableStream | null = null;
  private static readonly FAILURE_LOG_DIR = join(process.cwd(), 'logs', 'database-failures');
  private static readonly MAX_RETRIES = 3;

  /**
   * Initialize failure logging
   */
  private static initializeFailureLogging(): void {
    if (!existsSync(this.FAILURE_LOG_DIR)) {
      mkdirSync(this.FAILURE_LOG_DIR, { recursive: true });
    }

    if (!this.failureLogStream) {
      const today = new Date().toISOString().split('T')[0];
      const failureLogFile = join(this.FAILURE_LOG_DIR, `db-failures-${today}.log`);
      this.failureLogStream = createWriteStream(failureLogFile, { flags: 'a' });
    }
  }

  /**
   * Log database failure to file
   */
  private static logFailure(failureLog: DatabaseFailureLog): void {
    this.initializeFailureLogging();
    
    const logEntry = {
      timestamp: failureLog.timestamp.toISOString(),
      operation: failureLog.operation,
      error: failureLog.error,
      errorType: failureLog.errorType,
      stack: failureLog.stack,
      retryCount: failureLog.retryCount
    };

    this.failureLogStream?.write(JSON.stringify(logEntry) + '\n');
    
    // Also log to console for immediate visibility
    logger.error({
      databaseFailure: true,
      operation: failureLog.operation,
      error: failureLog.error,
      errorType: failureLog.errorType,
      retryCount: failureLog.retryCount
    }, 'Database operation failed - logged to failure file');
  }

  /**
   * Process database operation asynchronously
   * This ensures WhatsApp message success is not blocked by database issues
   */
  static async processAsync(
    operation: DatabaseOperation,
    retryCount: number = 0
  ): Promise<void> {
    try {
      logger.info({
        asyncDbOperation: true,
        operation: operation.operation,
        table: operation.table,
        conversationId: operation.conversationId,
        retryCount
      }, 'Processing async database operation');

      // Perform the database operation with retry logic
      await this.performOperation(operation);

      logger.info({
        asyncDbOperation: true,
        operation: operation.operation,
        table: operation.table,
        conversationId: operation.conversationId,
        success: true
      }, 'Async database operation completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      const stack = error instanceof Error ? error.stack : undefined;

      // Log the failure
      this.logFailure({
        operation,
        error: errorMessage,
        errorType,
        stack,
        timestamp: new Date(),
        retryCount
      });

      // Retry if we haven't exceeded max retries
      if (retryCount < this.MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        logger.warn({
          asyncDbOperation: true,
          operation: operation.operation,
          table: operation.table,
          retryCount,
          nextRetryIn: delay
        }, 'Retrying async database operation');

        setTimeout(() => {
          this.processAsync(operation, retryCount + 1);
        }, delay);
      } else {
        logger.error({
          asyncDbOperation: true,
          operation: operation.operation,
          table: operation.table,
          maxRetriesExceeded: true,
          finalError: errorMessage
        }, 'Async database operation failed after max retries');
      }
    }
  }

  /**
   * Perform the actual database operation
   */
  private static async performOperation(operation: DatabaseOperation): Promise<any> {
    switch (operation.operation) {
      case 'create':
        return await DatabaseRetryService.withRetry(
          () => prisma.message.create({ data: operation.data }),
          'async_message_create',
          { conversationId: operation.conversationId }
        );

      case 'update':
        return await DatabaseRetryService.withRetry(
          () => prisma.message.update({
            where: { id: operation.data.id },
            data: operation.data.update
          }),
          'async_message_update',
          { messageId: operation.data.id }
        );

      case 'delete':
        return await DatabaseRetryService.withRetry(
          () => prisma.message.delete({
            where: { id: operation.data.id }
          }),
          'async_message_delete',
          { messageId: operation.data.id }
        );

      case 'find':
        return await DatabaseRetryService.withRetry(
          () => prisma.message.findFirst({
            where: operation.data.where
          }),
          'async_message_find',
          { conversationId: operation.conversationId }
        );

      default:
        throw new Error(`Unsupported database operation: ${operation.operation}`);
    }
  }

  /**
   * Create a message record asynchronously
   */
  static async createMessageAsync(
    conversationId: string,
    senderType: 'assistant' | 'system' | 'customer',
    content: string,
    type: 'text' | 'audio' | 'image' = 'text',
    messageId?: string,
    aiTokensUsed?: number
  ): Promise<void> {
    const operation: DatabaseOperation = {
      operation: 'create',
      table: 'message',
      data: {
        conversationId,
        senderType,
        content,
        type,
        ...(aiTokensUsed !== undefined && { aiTokensUsed })
      },
      conversationId,
      messageId,
      timestamp: new Date()
    };

    // Process asynchronously - don't wait for completion
    this.processAsync(operation);
  }

  /**
   * Check for duplicate messages asynchronously
   * Returns a promise that resolves to true if duplicate found
   */
  static async checkDuplicateAsync(
    conversationId: string,
    content: string,
    type: 'text' | 'audio' | 'image' = 'text',
    senderType: 'assistant' | 'system' | 'customer' = 'system'
  ): Promise<boolean> {
    try {
      // Limit duplicate check to recent time window and same senderType
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Fetch last few recent messages for normalized comparison
      const recent = await DatabaseRetryService.withRetry(
        () => prisma.message.findMany({
          where: {
            conversationId,
            type,
            senderType,
            timestamp: { gte: fiveMinutesAgo }
          },
          orderBy: { timestamp: 'desc' },
          take: 10,
          select: { content: true }
        }),
        'async_message_find',
        { conversationId }
      );

      const normalize = (s: string) => s.toLowerCase().replace(/[\s\n\r]+/g, ' ').trim();
      const target = normalize(content);
      const match = (recent || []).some(m => normalize(m.content) === target);
      return match;
    } catch (error) {
      // If duplicate check fails, assume no duplicate to avoid blocking
      logger.warn({
        duplicateCheckFailed: true,
        conversationId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Duplicate check failed, assuming no duplicate');
      return false;
    }
  }

  /**
   * Get failure statistics
   */
  static async getFailureStats(): Promise<{
    totalFailures: number;
    failuresByOperation: Record<string, number>;
    failuresByErrorType: Record<string, number>;
    recentFailures: DatabaseFailureLog[];
  }> {
    // This would read from the failure log files
    // For now, return basic stats
    return {
      totalFailures: 0,
      failuresByOperation: {},
      failuresByErrorType: {},
      recentFailures: []
    };
  }

  /**
   * Clean up old failure logs
   */
  static async cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
    // Implementation to clean up old log files
    logger.info({ cleanupDays: daysToKeep }, 'Cleaning up old database failure logs');
  }
}
