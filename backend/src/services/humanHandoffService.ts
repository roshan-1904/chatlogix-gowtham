import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

export interface HandoffResult {
    message: string;
    success: boolean;
}

/**
 * Service to handle human handoff requests
 */
export class HumanHandoffService {
    /**
     * Execute handoff logic:
     * 1. Pause AI for the conversation
     * 2. Return standard handoff message
     */
    async executeHandoff(conversationId: string, vendorId: string): Promise<HandoffResult> {
        try {
            logger.info({ conversationId, vendorId }, 'Executing human handoff');

            // Fetch vendor name
            const vendor = await prisma.vendor.findUnique({
                where: { id: vendorId },
                select: { businessName: true }
            });

            const vendorName = vendor?.businessName || 'our team';

            // Update conversation to pause AI
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { aiPaused: true }
            });

            // Standard handoff message
            const message = `I've passed your message along to ${vendorName}. They'll get back to you as soon as possible!`;

            return {
                message,
                success: true
            };
        } catch (error) {
            logger.error({ err: error, conversationId }, 'Failed to execute human handoff');
            return {
                message: "I've notified the team. Please wait for a human agent.",
                success: false
            };
        }
    }

    /**
     * Resume AI for the conversation
     */
    async resumeAI(conversationId: string): Promise<HandoffResult> {
        try {
            logger.info({ conversationId }, 'Resuming AI for conversation');

            await prisma.conversation.update({
                where: { id: conversationId },
                data: { aiPaused: false }
            });

            return {
                message: "I’m back! Let me know what you need, I’ll be taking over the conversation from here.",
                success: true
            };
        } catch (error) {
            logger.error({ err: error, conversationId }, 'Failed to resume AI');
            return {
                message: "Failed to resume AI. Please try again.",
                success: false
            };
        }
    }
}

export const humanHandoffService = new HumanHandoffService();
