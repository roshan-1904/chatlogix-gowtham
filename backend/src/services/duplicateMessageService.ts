import { logger } from '../logger.js';

/**
 * Thin in-memory pre-check for duplicate webhook deliveries. The DB-level
 * unique constraint on Message.whatsappMessageId is the source of truth;
 * this cache short-circuits hot writes on burst redeliveries.
 */
export class DuplicateMessageService {
  private static processedMessages = new Set<string>();
  private static readonly MAX_CACHE_SIZE = 1000;

  static isDuplicate(whatsappMessageId: string): boolean {
    if (this.processedMessages.has(whatsappMessageId)) {
      logger.info({ whatsappMessageId }, 'Duplicate message detected (in-memory cache)');
      return true;
    }
    this.addToCache(whatsappMessageId);
    return false;
  }

  private static addToCache(whatsappMessageId: string): void {
    if (this.processedMessages.size >= this.MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.processedMessages).slice(0, 100);
      keysToDelete.forEach(key => this.processedMessages.delete(key));
    }
    this.processedMessages.add(whatsappMessageId);
  }

  static clearCache(): void {
    this.processedMessages.clear();
    logger.info('Duplicate message cache cleared');
  }

  static getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.processedMessages.size,
      maxSize: this.MAX_CACHE_SIZE
    };
  }
}
