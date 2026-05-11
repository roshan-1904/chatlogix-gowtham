/**
 * Complaint Service
 * Handles logging and tracking customer complaints
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { IntentClassification } from '../types/multiStage.js';

export interface ComplaintLog {
  conversationId: string;
  vendorId: string;
  customerId: string;
  complaintType: string;
  description: string;
  orderNumber?: string | null;
  status: 'open' | 'resolved' | 'escalated';
  createdAt: Date;
}

/**
 * Log a customer complaint
 */
export async function logComplaint(
  conversationId: string,
  vendorId: string,
  intentResult: IntentClassification
): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });

    if (!conversation) {
      logger.warn({ conversationId }, 'Conversation not found for complaint logging');
      return;
    }

    const complaintType = intentResult.extractedInfo?.complaintType || 'other';
    const orderNumber = intentResult.extractedInfo?.orderNumber || null;

    // Log to database (using existing logging mechanism or create Complaint model)
    // For now, log to conversation memory or create a separate log entry
    logger.info({
      conversationId,
      vendorId,
      customerId: conversation.customerId,
      complaintType,
      orderNumber,
      intent: intentResult.primaryIntent,
      reasoning: intentResult.reasoning
    }, 'Customer complaint logged');

    // TODO: Create Complaint model in Prisma if needed for tracking
    // await prisma.complaint.create({ ... });
    
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to log complaint');
  }
}

/**
 * Check if complaint should be escalated to vendor
 */
export async function shouldEscalateComplaint(
  complaintType: string,
  vendorId: string
): Promise<boolean> {
  // Escalate quality issues, wrong items, and service complaints
  const escalateTypes = ['quality', 'wrong_item', 'service'];
  return escalateTypes.includes(complaintType);
}

/**
 * Escalate complaint to vendor
 */
export async function escalateComplaint(
  complaintId: string,
  vendorId: string
): Promise<void> {
  try {
    // Notify vendor about complaint
    // Could use notification service or webhook
    logger.info({ complaintId, vendorId }, 'Complaint escalated to vendor');
    
    // TODO: Implement vendor notification
    // await notifyVendor(vendorId, { type: 'complaint', complaintId });
  } catch (error) {
    logger.error({ err: error, complaintId, vendorId }, 'Failed to escalate complaint');
  }
}

