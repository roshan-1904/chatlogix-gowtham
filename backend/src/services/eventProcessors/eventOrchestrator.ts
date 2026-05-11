import { logger } from '../../logger.js';
import { AIStructuredResponse, EventProcessingContext, EventProcessingResult } from '../../types/aiResponse.js';
import { OrderEventProcessor } from './orderEventProcessor.js';
import { CustomerEventProcessor } from './customerEventProcessor.js';

export class EventOrchestrator {
  private orderProcessor: OrderEventProcessor;
  private customerProcessor: CustomerEventProcessor;

  constructor() {
    this.orderProcessor = new OrderEventProcessor();
    this.customerProcessor = new CustomerEventProcessor();
  }

  /**
   * Process AI response and execute all events in parallel
   */
  async processAIResponse(
    response: AIStructuredResponse,
    context: EventProcessingContext
  ): Promise<EventProcessingResult> {
    const startTime = Date.now();
    const eventsProcessed: string[] = [];
    const errors: string[] = [];

    logger.info({ 
      conversationId: context.conversationId,
      hasOrderEvent: !!response.orderUpdateEvent,
      hasCustomerEvent: !!response.customerUpdateEvent
    }, 'Starting event orchestration');

    try {
      // Validate events before processing
      const validationResult = this.validateEvents(response);
      if (!validationResult.isValid) {
        throw new Error(`Event validation failed: ${validationResult.errors?.join(', ')}`);
      }

      // Prepare parallel processing tasks
      const tasks: Promise<void>[] = [];

      // Process order event if present
      if (response.orderUpdateEvent && response.orderUpdateEvent.action !== 'none') {
        tasks.push(
          this.processOrderEvent(response.orderUpdateEvent, context)
            .then(() => {
              eventsProcessed.push('order');
              return Promise.resolve();
            })
            .catch(error => {
              errors.push(`Order event failed: ${error.message}`);
              logger.error({ error, context }, 'Order event processing failed');
              return Promise.resolve();
            })
        );
      }

      // Process customer event if present
      if (response.customerUpdateEvent && response.customerUpdateEvent.shouldUpdate) {
        tasks.push(
          this.processCustomerEvent(response.customerUpdateEvent, context)
            .then(() => {
              eventsProcessed.push('customer');
              return Promise.resolve();
            })
            .catch(error => {
              errors.push(`Customer event failed: ${error.message}`);
              logger.error({ error, context }, 'Customer event processing failed');
              return Promise.resolve();
            })
        );
      }

      // Execute all events in parallel
      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }

      const duration = Date.now() - startTime;
      const result: EventProcessingResult = {
        success: errors.length === 0,
        eventsProcessed,
        errors: errors.length > 0 ? errors : undefined,
        duration
      };

      logger.info({
        conversationId: context.conversationId,
        ...result
      }, 'Event orchestration completed');

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, context, duration }, 'Event orchestration failed');
      
      return {
        success: false,
        eventsProcessed,
        errors: [`Orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        duration
      };
    }
  }

  /**
   * Process order event
   */
  private async processOrderEvent(
    event: any,
    context: EventProcessingContext
  ): Promise<void> {
    await this.orderProcessor.processEvent(event, context);
  }

  /**
   * Process customer event
   */
  private async processCustomerEvent(
    event: any,
    context: EventProcessingContext
  ): Promise<void> {
    // Validate and sanitize event
    if (!this.customerProcessor.validateEvent(event)) {
      throw new Error('Invalid customer event');
    }

    const sanitizedEvent = this.customerProcessor.sanitizeEvent(event);
    await this.customerProcessor.processEvent(sanitizedEvent, context);
  }

  /**
   * Validate all events in the AI response
   */
  private validateEvents(response: AIStructuredResponse): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Validate customer message
    if (!response.customerMessage || typeof response.customerMessage !== 'string') {
      errors.push('Missing or invalid customerMessage');
    }

    // Validate order event if present
    if (response.orderUpdateEvent) {
      if (!response.orderUpdateEvent.action) {
        errors.push('Order event missing action');
      } else if (!['create', 'update', 'cancel', 'confirm', 'none'].includes(response.orderUpdateEvent.action)) {
        errors.push('Invalid order event action');
      }
    }

    // Validate customer event if present
    if (response.customerUpdateEvent) {
      if (typeof response.customerUpdateEvent.shouldUpdate !== 'boolean') {
        errors.push('Customer event missing shouldUpdate boolean');
      }
      
      if (response.customerUpdateEvent.shouldUpdate && !response.customerUpdateEvent.updates) {
        errors.push('Customer event shouldUpdate is true but no updates provided');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalEventsProcessed: number;
    successRate: number;
    averageProcessingTime: number;
  }> {
    // This would typically query a metrics store
    // For now, return mock data
    return {
      totalEventsProcessed: 0,
      successRate: 100,
      averageProcessingTime: 0
    };
  }
}
