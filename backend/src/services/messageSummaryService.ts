/**
 * Message Summary Service
 * 
 * Generates AI-powered summaries for each customer message to improve intent classification
 * and prevent redundant questions. Each summary is self-contained and includes customer
 * insights and conversation context.
 * 
 * Reference: Message Summary System Implementation Plan
 */

import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import { OpenAI } from 'openai';
import { CustomerInsightsService } from './customerInsightsService.js';
import { ConversationMemory } from './conversationMemoryService.js';
import { calculateCostFromUsage } from '../utils/costCalculator.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface MessageSummaryResult {
  summary: string;
  expectedNext: string;
  metadata?: {
    tokensUsed: number;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
  };
}

/**
 * Generate a self-contained summary for a customer message
 * Includes: what happened, what was asked, known customer info, missing info, expected next
 */
export async function generateMessageSummary(
  messageId: string,
  conversationId: string,
  customerId: string,
  vendorId: string,
  currentMessage: { content: string; senderType: string },
  lastAssistantMessage: string | null,
  conversationContext: {
    pendingOrder?: any;
    conversationStage: string;
    memory?: ConversationMemory;
  }
): Promise<MessageSummaryResult> {
  if (!openai) {
    logger.warn({ messageId }, 'OpenAI not configured, skipping summary generation');
    return { summary: '', expectedNext: '' };
  }

  try {
    // Fetch customer insights (what we already know)
    const insightsService = new CustomerInsightsService();
    const customerInsights = await insightsService.getOrCreateInsights(customerId, vendorId);
    
    // Build known information list
    const knownInfo: string[] = [];
    const missingInfo: string[] = [];
    
    if (customerInsights.customerName) {
      knownInfo.push(`Customer Name: ${customerInsights.customerName}`);
    } else {
      missingInfo.push('Customer Name');
    }
    
    if (customerInsights.deliveryAddress || customerInsights.primaryDeliveryAddress) {
      const address = customerInsights.deliveryAddress || customerInsights.primaryDeliveryAddress;
      knownInfo.push(`Delivery Address: ${address}`);
    } else {
      missingInfo.push('Delivery Address');
    }
    
    if (customerInsights.preferences) {
      knownInfo.push(`Preferences: ${customerInsights.preferences}`);
    }
    
    if (customerInsights.communicationStyle) {
      knownInfo.push(`Communication Style: ${customerInsights.communicationStyle}`);
    }
    
    // Extract key info from current message
    const extractedInfo = extractKeyInfoFromMessage(
      currentMessage.content,
      conversationContext.pendingOrder
    );
    
    // Build prompt
    const prompt = buildSummaryPrompt(
      currentMessage,
      lastAssistantMessage,
      conversationContext,
      knownInfo,
      missingInfo,
      extractedInfo
    );
    
    // Generate summary using AI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200
    });
    
    const summary = completion.choices[0]?.message?.content || '';
    
    // Calculate cost
    const cost = calculateCostFromUsage(completion.usage, 'gpt-4o-mini');
    
    // Extract expected next action
    const expectedNextMatch = summary.match(/Expected Next: (.+)/);
    const expectedNext = expectedNextMatch ? expectedNextMatch[1] : '';
    
    return {
      summary: summary.trim(),
      expectedNext: expectedNext.trim(),
      metadata: {
        tokensUsed: completion.usage?.total_tokens || 0,
        model: 'gpt-4o-mini',
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens
      }
    };
  } catch (error) {
    logger.error({ err: error, messageId, conversationId }, 'Failed to generate message summary');
    return { summary: '', expectedNext: '' };
  }
}

/**
 * Build the prompt for summary generation
 */
function buildSummaryPrompt(
  currentMessage: { content: string; senderType: string },
  lastAssistantMessage: string | null,
  conversationContext: {
    pendingOrder?: any;
    conversationStage: string;
    memory?: ConversationMemory;
  },
  knownInfo: string[],
  missingInfo: string[],
  extractedInfo: string[]
): string {
  return `You are a conversation summarizer. Create a concise, self-contained summary.

Current Message: "${currentMessage.content}"
Sender: ${currentMessage.senderType}

Previous Assistant Message: ${lastAssistantMessage || 'None'}

Conversation Context:
- Stage: ${conversationContext.conversationStage}
- Pending Order: ${conversationContext.pendingOrder ? 'Yes' : 'No'}
${conversationContext.pendingOrder ? `- Order Total: ₹${conversationContext.pendingOrder.totalAmount / 100}` : ''}
${conversationContext.pendingOrder?.orderNumber ? `- Order Number: ${conversationContext.pendingOrder.orderNumber}` : ''}

CUSTOMER INFORMATION WE ALREADY HAVE (DO NOT ASK FOR THESE):
${knownInfo.length > 0 ? knownInfo.map(info => `- ${info}`).join('\n') : '- None'}

INFORMATION WE'RE MISSING (can ask for these):
${missingInfo.length > 0 ? missingInfo.map(info => `- ${info}`).join('\n') : '- None'}

KEY INFORMATION EXTRACTED FROM THIS MESSAGE:
${extractedInfo.length > 0 ? extractedInfo.map(info => `- ${info}`).join('\n') : '- None'}

Create a summary that includes:
1. What happened in this message
2. What was asked previously (if assistant asked something)
3. What information we ALREADY HAVE about the customer (from knownInfo above)
4. What information we're MISSING (from missingInfo above)
5. Key information extracted from this message
6. What we expect the customer to do next

CRITICAL: The summary should clearly state what we already know so we DON'T ask for it again.

Format:
What Happened: [brief description]
What Was Asked: [what assistant asked, or "None"]
Known Info: [list what we already have]
Missing Info: [list what we're missing]
Key Info Extracted: [new information from this message]
Expected Next: [what customer will likely do next]

Keep it concise (80-120 words).`;
}

/**
 * Extract key information from message content
 */
function extractKeyInfoFromMessage(message: string, pendingOrder?: any): string[] {
  const info: string[] = [];
  
  // Extract name if mentioned (simple pattern - capital letter followed by lowercase letters, 2-20 chars)
  const namePattern = /\b([A-Z][a-z]{2,19})\b/;
  const nameMatch = message.match(namePattern);
  if (nameMatch && nameMatch[1].length >= 2 && nameMatch[1].length <= 20) {
    // Check if it's not a common word
    const commonWords = ['Yes', 'No', 'Ok', 'Okay', 'Sure', 'Fine', 'Hello', 'Hi', 'Thanks', 'Thank'];
    if (!commonWords.includes(nameMatch[1])) {
      info.push(`Name mentioned: ${nameMatch[1]}`);
    }
  }
  
  // Extract address if mentioned (has numbers and location words)
  const addressKeywords = ['street', 'road', 'address', 'tower', 'flat', 'apartment', 'building', 'area', 'pincode', 'pin code', 'location'];
  const hasAddressKeywords = addressKeywords.some(keyword => message.toLowerCase().includes(keyword));
  if (/\d+/.test(message) && hasAddressKeywords) {
    info.push('Address mentioned');
  }
  
  // Extract order confirmation
  const confirmationWords = ['yes', 'confirm', 'ok', 'sure', 'okay', 'fine', 'proceed', 'go ahead'];
  if (confirmationWords.some(word => message.toLowerCase().includes(word))) {
    info.push('Order confirmation');
  }
  
  // Add pending order info if exists
  if (pendingOrder) {
    info.push(`Pending order: ₹${pendingOrder.totalAmount / 100}`);
    if (pendingOrder.items && Array.isArray(pendingOrder.items)) {
      const itemCount = pendingOrder.items.length;
      info.push(`Order items: ${itemCount} item(s)`);
    }
  }
  
  return info;
}

