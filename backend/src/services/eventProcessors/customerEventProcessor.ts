import { logger } from '../../logger.js';
import { CustomerUpdateEvent, EventProcessingContext } from '../../types/aiResponse.js';
import { CustomerInsightsService } from '../customerInsightsService.js';

export class CustomerEventProcessor {
  private insightsService: CustomerInsightsService;
  
  constructor() {
    this.insightsService = new CustomerInsightsService();
  }

  async processEvent(
    event: CustomerUpdateEvent,
    context: EventProcessingContext
  ): Promise<void> {
    if (!event || !event.shouldUpdate) {
      return;
    }

    logger.info({ 
      customerId: context.customerId,
      vendorId: context.vendorId,
      updates: Object.keys(event.updates)
    }, 'Processing customer event');

    try {
      // Merge new insights with existing
      await this.insightsService.updateInsights(
        context.customerId,
        context.vendorId,
        event.updates
      );
      
      logger.info({
        customerId: context.customerId,
        vendorId: context.vendorId,
        updatedFields: Object.keys(event.updates).filter(key => event.updates[key as keyof typeof event.updates])
      }, 'Customer insights updated successfully');
    } catch (error) {
      logger.error({ 
        error, 
        customerId: context.customerId,
        vendorId: context.vendorId,
        context 
      }, 'Error processing customer event');
      throw error;
    }
  }

  /**
   * Validate customer update event
   */
  validateEvent(event: CustomerUpdateEvent): boolean {
    if (!event || typeof event.shouldUpdate !== 'boolean') {
      logger.warn({ event }, 'Customer event missing shouldUpdate boolean');
      return false;
    }

    if (!event.shouldUpdate) {
      return true; // Valid to not update
    }

    if (!event.updates || typeof event.updates !== 'object') {
      logger.warn({ event }, 'Customer event shouldUpdate is true but updates object is missing');
      return false;
    }

    // Check if at least one field has a valid value (string, array, or object)
    const hasValidUpdate = Object.values(event.updates).some(value => {
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (typeof value === 'object' && value !== null) {
        return Object.keys(value).length > 0;
      }
      return false;
    });

    if (!hasValidUpdate) {
      logger.warn({ 
        event, 
        updates: event.updates,
        updateKeys: Object.keys(event.updates || {})
      }, 'Customer event shouldUpdate is true but no valid updates found');
    }

    return hasValidUpdate;
  }

  /**
   * Sanitize customer update event
   */
  sanitizeEvent(event: CustomerUpdateEvent): CustomerUpdateEvent {
    if (!event || !event.updates) {
      return event;
    }

    const sanitizedUpdates = { ...event.updates };
    
    // Trim whitespace and limit length for string fields only
    // Skip JSON fields (whatsappLocation, specialOccasions) and arrays
    Object.keys(sanitizedUpdates).forEach(key => {
      const value = sanitizedUpdates[key as keyof typeof sanitizedUpdates];
      if (typeof value === 'string') {
        sanitizedUpdates[key as keyof typeof sanitizedUpdates] = value.trim().substring(0, 1000) as any;
      }
      // For arrays and objects, leave them as-is (they'll be validated elsewhere)
    });

    return {
      ...event,
      updates: sanitizedUpdates
    };
  }
}
