/**
 * Data Enrichment Service
 * 
 * Fetches additional context when clarification is needed (Stage 5)
 * Reference: Phase 5 - Stage 5: Conditional Data Enrichment (Implementation Plan)
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { PrimaryAIResponse } from './primaryAIResponseService.js';
import { getCachedCustomerInsights, getCachedPendingOrder } from '../utils/cacheStrategy.js';

export interface EnrichmentData {
  additionalContext: any;
  canProceed: boolean;
  missingFields: string[];
}

/**
 * Fetch additional context when clarification is needed
 * No AI call - Pure data fetching based on clarification strategy
 */
export async function enrichWithAdditionalData(
  initialResponse: PrimaryAIResponse,
  conversationId: string,
  vendorId: string,
  customerId: string
): Promise<EnrichmentData> {
  try {
    const strategy = initialResponse.clarificationStrategy;
    
    if (!strategy || !initialResponse.needsClarification) {
      return {
        additionalContext: {},
        canProceed: true,
        missingFields: []
      };
    }
    
    const missingFields = strategy.missingFields || [];
    const additionalContext: any = {};
    
    // Fetch context only for high-priority missing fields
    const highPriorityFields = strategy.clarificationQuestions
      ?.filter(q => q.priority === 'high')
      .map(q => q.field) || [];
    
    // If can proceed with defaults, return early
    if (strategy.canProceedWithDefaults) {
      return {
        additionalContext: {},
        canProceed: true,
        missingFields: []
      };
    }
    
    // Fetch customer insights if needed for address/contact info
    if (highPriorityFields.some(f => f.includes('address') || f.includes('contact') || f.includes('phone'))) {
      const insights = await getCachedCustomerInsights(customerId, vendorId);
      if (insights) {
        additionalContext.customerInsights = {
          name: insights.customerName,
          phone: insights.phone,
          primaryDeliveryAddress: insights.primaryDeliveryAddress,
          preferredLanguage: insights.preferredLanguage
        };
      }
    }
    
    // Fetch pending order if needed for order context
    if (highPriorityFields.some(f => f.includes('order') || f.includes('quantity') || f.includes('product'))) {
      const pendingOrder = await getCachedPendingOrder(conversationId);
      if (pendingOrder) {
        additionalContext.pendingOrder = {
          orderNumber: pendingOrder.orderNumber,
          items: pendingOrder.items,
          totalAmount: pendingOrder.totalAmount,
          status: pendingOrder.status
        };
      }
    }
    
    // Fetch recent messages for context
    if (highPriorityFields.length > 0) {
      const recentMessages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        take: 5,
        select: {
          senderType: true,
          content: true,
          timestamp: true
        }
      });
      
      additionalContext.recentMessages = recentMessages.reverse();
    }
    
    return {
      additionalContext,
      canProceed: false, // Still needs clarification
      missingFields: highPriorityFields
    };
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Data enrichment failed');
    return {
      additionalContext: {},
      canProceed: false,
      missingFields: []
    };
  }
}

