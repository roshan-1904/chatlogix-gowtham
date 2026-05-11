import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';

/**
 * Service to handle database retry logic for connection issues
 */
export class DatabaseRetryService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000; // 1 second

  /**
   * Execute a database operation with retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, any>
  ): Promise<T> {
    let lastError: Error | null = null;
    const startTime = Date.now();

    logger.info({
      operationName,
      maxRetries: this.MAX_RETRIES,
      context,
      startTime: new Date(startTime).toISOString()
    }, `🔄 Starting database retry operation: ${operationName}`);

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const attemptStartTime = Date.now();
      
      try {
        logger.debug({
          operationName,
          attempt,
          maxRetries: this.MAX_RETRIES,
          context
        }, `🔄 Attempt ${attempt}/${this.MAX_RETRIES} for ${operationName}`);
        
        const result = await operation();
        const attemptDuration = Date.now() - attemptStartTime;
        const totalDuration = Date.now() - startTime;
        
        if (attempt > 1) {
          logger.info({
            operationName,
            attempt,
            context,
            attemptDuration,
            totalDuration
          }, `✅ Database operation succeeded on attempt ${attempt} after ${totalDuration}ms total`);
        } else {
          logger.info({
            operationName,
            attempt,
            context,
            attemptDuration,
            totalDuration
          }, `✅ Database operation succeeded on first attempt in ${attemptDuration}ms`);
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const attemptDuration = Date.now() - attemptStartTime;
        const isConnectionError = this.isConnectionError(error);
        
        logger.warn({
          operationName,
          attempt,
          maxRetries: this.MAX_RETRIES,
          isConnectionError,
          error: lastError.message,
          errorType: lastError.constructor.name,
          context,
          attemptDuration
        }, `❌ Database operation failed on attempt ${attempt}/${this.MAX_RETRIES} after ${attemptDuration}ms`);

        // Don't retry on non-connection errors
        if (!isConnectionError) {
          logger.error({
            operationName,
            attempt,
            error: lastError.message,
            errorType: lastError.constructor.name,
            context
          }, `🚫 Non-connection error detected, not retrying`);
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.MAX_RETRIES) {
          logger.error({
            operationName,
            attempt,
            maxRetries: this.MAX_RETRIES,
            error: lastError.message,
            errorType: lastError.constructor.name,
            context,
            totalDuration: Date.now() - startTime
          }, `🚫 Max retries (${this.MAX_RETRIES}) reached, giving up`);
          break;
        }

        // Wait before retry
        const retryDelay = this.RETRY_DELAY_MS * attempt;
        logger.info({
          operationName,
          attempt,
          nextAttempt: attempt + 1,
          retryDelay
        }, `⏳ Waiting ${retryDelay}ms before retry attempt ${attempt + 1}`);
        
        await this.delay(retryDelay);
      }
    }

    // If we get here, all retries failed
    const totalDuration = Date.now() - startTime;
    logger.error({
      operationName,
      maxRetries: this.MAX_RETRIES,
      context,
      totalDuration,
      finalError: lastError?.message,
      finalErrorType: lastError?.constructor.name
    }, `💥 Database operation failed after ${this.MAX_RETRIES} attempts in ${totalDuration}ms total`);
    
    throw lastError || new Error('Database operation failed');
  }

  /**
   * Check if the error is a connection-related error
   */
  private static isConnectionError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    const name = error?.name?.toLowerCase() || '';
    
    return (
      name.includes('prismaclientinitializationerror') ||
      name.includes('connection') ||
      name.includes('timeout') ||
      message.includes('can\'t reach database server') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('pool')
    );
  }

  /**
   * Delay execution for specified milliseconds
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry-enabled Prisma client wrapper
   */
  static createRetryWrapper(prisma: PrismaClient) {
    return {
      message: {
        create: (args: any) => this.withRetry(
          () => prisma.message.create(args),
          'message.create',
          { args }
        ),
        findMany: (args: any) => this.withRetry(
          () => prisma.message.findMany(args),
          'message.findMany',
          { args }
        ),
        findFirst: (args: any) => this.withRetry(
          () => prisma.message.findFirst(args),
          'message.findFirst',
          { args }
        )
      },
      conversation: {
        create: (args: any) => this.withRetry(
          () => prisma.conversation.create(args),
          'conversation.create',
          { args }
        ),
        findFirst: (args: any) => this.withRetry(
          () => prisma.conversation.findFirst(args),
          'conversation.findFirst',
          { args }
        )
      },
      customer: {
        upsert: (args: any) => this.withRetry(
          () => prisma.customer.upsert(args),
          'customer.upsert',
          { args }
        )
      },
      order: {
        findMany: (args: any) => this.withRetry(
          () => prisma.order.findMany(args),
          'order.findMany',
          { args }
        ),
        groupBy: (args: any) => this.withRetry(
          () => prisma.order.groupBy(args),
          'order.groupBy',
          { args }
        )
      }
    };
  }
}
