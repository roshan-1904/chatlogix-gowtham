/**
 * Conversation Memory Service
 * 
 * Manages conversation memory for Stage 0.5
 * Reference: Phase 2: Conversation Memory Service (Implementation Plan)
 */

import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { getCachedConversationMemory, cacheConversationMemory, CACHE_TTL } from '../utils/cacheStrategy.js';
import { getCached, setCached } from '../utils/redis.js';
import { AIService } from './aiService.js';
import { env } from '../config/env.js';
import { OpenAI } from 'openai';

const aiService = new AIService();

export interface ConversationMemory {
  keyFacts: string[];
  ongoingTopics: string[];
  customerPreferences: Record<string, any>;
  lastOrderSummary?: string;
  conversationSummary: string;
  importantContext: string[];
  turnNumber: number;
  conversationStage: 'greeting' | 'information_gathering' | 'order_confirmation' | 'closing';
  handoffConfirmationPending?: boolean;
  conversationHistory?: Array<{ content: string; senderType: string; timestamp: Date }>; // ENHANCEMENT: Full conversation history
}

export interface ConversationMemoryInput {
  conversationId: string;
  vendorId: string;
  normalizedMessage: string;
  currentMessage?: string;
}

/**
 * Retrieve conversation memory with caching
 * CRITICAL: Must be fast (< 100ms)
 */
export async function retrieveConversationMemory(
  input: ConversationMemoryInput
): Promise<ConversationMemory> {
  const { conversationId, vendorId } = input;

  // Try cache first (5 minute TTL)
  // Try cache first (5 minute TTL)
  const cached = await getCachedConversationMemory(conversationId);
  const handoffPending = await getCached<boolean>(`handoff_pending:${conversationId}`);

  if (cached) {
    return { ...cached, handoffConfirmationPending: handoffPending || false };
  }

  try {
    const dbMemory = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });

    if (dbMemory) {
      // ENHANCEMENT: Fetch more conversation history for better context retention
      const conversationHistory = await prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { timestamp: 'desc' },
        take: 20, // Increased from 10 for better context
        select: {
          content: true,
          senderType: true,
          timestamp: true
        }
      });

      const memory: ConversationMemory = {
        keyFacts: dbMemory.keyFacts as string[],
        ongoingTopics: dbMemory.ongoingTopics as string[],
        customerPreferences: dbMemory.customerPreferences as Record<string, any>,
        lastOrderSummary: dbMemory.lastOrderSummary || undefined,
        conversationSummary: dbMemory.conversationSummary,
        importantContext: dbMemory.importantContext as string[],
        turnNumber: dbMemory.turnNumber,
        conversationStage: dbMemory.conversationStage as ConversationMemory['conversationStage'],
        conversationHistory: conversationHistory.reverse() // Chronological order
      };

      await cacheConversationMemory(conversationId, memory);
      return { ...memory, handoffConfirmationPending: handoffPending || false };
    }

    return await createInitialMemory(conversationId, vendorId);
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to retrieve memory');
    return getFallbackMemory();
  }
}

async function createInitialMemory(
  conversationId: string,
  vendorId: string
): Promise<ConversationMemory> {
  const initialMemory: ConversationMemory = {
    keyFacts: [],
    ongoingTopics: [],
    customerPreferences: {},
    conversationSummary: 'New conversation started',
    importantContext: [],
    turnNumber: 0,
    conversationStage: 'greeting'
  };

  try {
    await prisma.conversationMemory.create({
      data: {
        conversationId,
        vendorId,
        keyFacts: [],
        ongoingTopics: [],
        customerPreferences: {},
        conversationSummary: initialMemory.conversationSummary,
        importantContext: [],
        turnNumber: 0,
        conversationStage: 'greeting'
      }
    });

    await cacheConversationMemory(conversationId, initialMemory);
    return initialMemory;
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to create memory');
    return initialMemory;
  }
}

export async function setHandoffConfirmationStatus(conversationId: string, status: boolean): Promise<void> {
  const key = `handoff_pending:${conversationId}`;
  if (status) {
    await setCached(key, true, 300); // 5 minutes TTL for confirmation pending
  } else {
    await setCached(key, false, 1); // Expire immediately
  }
}

/**
 * Update conversation memory after processing
 * Enhanced to handle AI-extracted structured data and auto-extraction
 */
export async function updateConversationMemory(
  conversationId: string,
  vendorId: string,
  updates: {
    keyFacts?: string[];
    ongoingTopics?: string[];
    customerPreferences?: Record<string, any>;
    lastOrderSummary?: string;
    importantContext?: string[];
    conversationStage?: ConversationMemory['conversationStage'];
    incrementTurn?: boolean;
    // NEW: Allow passing full conversation history for better extraction
    conversationHistory?: Array<{ content: string; senderType: string; timestamp: Date }>;
    // NEW: Current message for context
    currentMessage?: string;
  }
): Promise<{ 
  customerInformation?: any;
  customerPreferences?: any;
}> {
  try {
    const current = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });

    if (!current) {
      await createInitialMemory(conversationId, vendorId);
      return {};
    }

    // If keyFacts not provided but we have conversation history, extract them
    let newKeyFacts = updates.keyFacts || [];
    let extractedCustomerInfo: any = undefined;
    let extractedPreferences: any = undefined;
    
    if (newKeyFacts.length === 0 && (updates.conversationHistory || updates.currentMessage)) {
      // Use AI-powered extraction
      const extractionResult = await extractKeyFacts(
        conversationId,
        updates.currentMessage || '',
        updates.conversationHistory
      );
      newKeyFacts = extractionResult.keyFacts;
      extractedCustomerInfo = extractionResult.customerInformation;
      extractedPreferences = extractionResult.customerPreferences;
    }

    // Merge key facts (append new ones, remove duplicates)
    let mergedKeyFacts = current.keyFacts as string[];
    if (newKeyFacts.length > 0) {
      mergedKeyFacts = [...new Set([...mergedKeyFacts, ...newKeyFacts])];
    }

    // Merge ongoing topics (append new ones, remove duplicates, keep last 10)
    let newOngoingTopics = current.ongoingTopics as string[];
    if (updates.ongoingTopics && updates.ongoingTopics.length > 0) {
      newOngoingTopics = [...new Set([...newOngoingTopics, ...updates.ongoingTopics])].slice(-10);
    }

    // Merge customer preferences (preserve existing, merge new structured data)
    let mergedPreferences = current.customerPreferences as Record<string, any> || {};
    if (updates.customerPreferences !== undefined) {
      mergedPreferences = { ...mergedPreferences, ...updates.customerPreferences };
    }

    const updatedData: any = {
      keyFacts: mergedKeyFacts,
      ongoingTopics: newOngoingTopics,
      customerPreferences: mergedPreferences,
      importantContext: updates.importantContext !== undefined 
        ? updates.importantContext 
        : current.importantContext,
      turnNumber: updates.incrementTurn ? current.turnNumber + 1 : current.turnNumber
    };

    if (updates.lastOrderSummary !== undefined) {
      updatedData.lastOrderSummary = updates.lastOrderSummary;
    }

    if (updates.conversationStage) {
      updatedData.conversationStage = updates.conversationStage;
    }

    // Generate summary every 12 messages
    if (updatedData.turnNumber % 12 === 0 && updatedData.turnNumber > 0) {
      updatedData.conversationSummary = await generateConversationSummary(conversationId);
    }

    await prisma.conversationMemory.update({
      where: { conversationId },
      data: updatedData
    });

    // Invalidate cache
    await cacheConversationMemory(conversationId, {
      keyFacts: updatedData.keyFacts as string[],
      ongoingTopics: updatedData.ongoingTopics as string[],
      customerPreferences: updatedData.customerPreferences as Record<string, any>,
      lastOrderSummary: updatedData.lastOrderSummary || undefined,
      conversationSummary: updatedData.conversationSummary,
      importantContext: updatedData.importantContext as string[],
      turnNumber: updatedData.turnNumber,
      conversationStage: updatedData.conversationStage as ConversationMemory['conversationStage']
    });

    // Return extracted customer information for use in customer insights update
    return {
      customerInformation: extractedCustomerInfo,
      customerPreferences: extractedPreferences
    };
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to update memory');
    return {};
  }
}

async function generateConversationSummary(conversationId: string): Promise<string> {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
      take: 30, // Increased for better context
      select: {
        senderType: true,
        content: true,
        timestamp: true
      }
    });

    if (messages.length === 0) {
      return 'No messages yet';
    }

    const conversationText = messages
      .reverse()
      .map(msg => `${msg.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    // Use AI to generate structured summary
    const summaryPrompt = `Summarize this WhatsApp conversation comprehensively. Extract ALL important information.

Conversation:
${conversationText}

Return ONLY valid JSON (no markdown, no code blocks, no explanations):
{
  "summary": "2-3 sentence summary of the conversation",
  "keyPoints": [
    "Key point 1",
    "Key point 2"
  ],
  "customerNeeds": [
    "Need 1",
    "Need 2"
  ],
  "pendingItems": [
    "Pending item 1",
    "Pending item 2"
  ],
  "resolvedItems": [
    "Resolved item 1",
    "Resolved item 2"
  ]
}

Focus on:
1. What the customer wants (products, quantities, delivery)
2. Key preferences mentioned (delivery time, special requests)
3. Current status (ordering, confirming, etc.)
4. Any unresolved questions or needs
5. Important context for future responses`;

    const response = await aiService.generateResponse(summaryPrompt, 'summary', undefined, conversationId);
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
      
      // Return structured summary (use summary field, fallback to key points)
      if (parsed.summary) {
        return parsed.summary.substring(0, 500);
      }
      
      // Fallback: Use key points if summary not available
      if (Array.isArray(parsed.keyPoints) && parsed.keyPoints.length > 0) {
        return parsed.keyPoints.join('. ').substring(0, 500);
      }
    } catch (parseError) {
      // Fallback to simple summary
      logger.warn({ parseError, conversationId }, 'Failed to parse structured summary, using simple summary');
    }

    // Fallback: Simple summary (original behavior)
    return response.substring(0, 500);
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Failed to generate summary');
    return 'Summary generation failed';
  }
}

/**
 * AI-Powered Key Facts Extraction
 * Uses AI with structured JSON output to extract ALL information from conversation
 * Ensures no information loss and handles unclear information gracefully
 */
export async function extractKeyFacts(
  conversationId: string,
  normalizedMessage: string,
  fullConversationHistory?: Array<{ content: string; senderType: string; timestamp: Date }>
): Promise<{ 
  keyFacts: string[]; 
  customerInformation?: any;
  customerPreferences?: any;
}> {
  const startTime = Date.now();
  
  // Check feature flag (default: true)
  const useAIExtraction = env.USE_AI_MEMORY_EXTRACTION !== 'false';
  
  if (!useAIExtraction) {
    logger.info({ conversationId }, 'AI memory extraction disabled, using keyword fallback');
    const messages = fullConversationHistory || await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { content: true, senderType: true, timestamp: true }
    });
    const fallbackFacts = fallbackKeywordExtraction(messages, normalizedMessage);
    return {
      keyFacts: fallbackFacts,
      customerInformation: undefined,
      customerPreferences: undefined
    };
  }

  try {
    // Get conversation history if not provided
    let conversationHistory = fullConversationHistory;
    if (!conversationHistory) {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        take: 30, // Increased for better context
        select: {
          content: true,
          senderType: true,
          timestamp: true
        }
      });
      conversationHistory = messages.reverse(); // Chronological order
    }

    if (conversationHistory.length === 0) {
      return {
        keyFacts: [],
        customerInformation: undefined,
        customerPreferences: undefined
      };
    }

    // Format conversation for AI
    const conversationText = conversationHistory
      .map(msg => `${msg.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    // Current message context
    const currentMessageContext = normalizedMessage 
      ? `\n\nCurrent Customer Message: "${normalizedMessage}"`
      : '';

    // AI Prompt with structured JSON schema
    const extractionPrompt = `You are an information extraction system for a WhatsApp business assistant.

Your task: Extract ALL key facts, preferences, and information mentioned in this conversation. Do not miss any details, even if they seem minor or unclear.

Conversation History:
${conversationText}${currentMessageContext}

CRITICAL EXTRACTION GUIDELINES:
1. Extract ALL mentioned information, not just obvious facts
2. Include customer name, even if mentioned casually or in response to a question
3. Extract ALL delivery preferences (time, date, location, instructions)
4. Extract ALL special requests, preferences, and customizations - THIS IS CRITICAL
5. Extract dietary restrictions, allergies, and food preferences
6. Extract payment preferences and methods mentioned
7. Extract special occasions (birthdays, anniversaries, events)
8. Extract customer communication style and preferences
9. Extract any addresses mentioned (home, office, alternate)
10. Extract phone numbers, emails if mentioned
11. Extract product preferences and dislikes
12. Extract any feedback, complaints, or compliments
13. If information is unclear or ambiguous, still extract it but mark as "unclear" or "needs clarification"
14. Extract context about previous orders or experiences
15. Extract any business-related questions or inquiries

CRITICAL: QUESTION-RESPONSE PATTERN RECOGNITION:
16. If the previous Assistant message asked for customer name (e.g., "What's your name?", "Could you provide your name?", "I need your name"), and the current Customer message is a single word or short phrase that looks like a name (e.g., "Murali", "John", "Ravi", "Priya"), extract it as the customer name in customerInformation.name
17. If the previous Assistant message asked for delivery address (e.g., "What's your address?", "Could you share your delivery address?", "I need your address"), and the current Customer message contains location information (address, area name, landmark), extract it as a delivery address in customerInformation.addresses
18. If the previous Assistant message asked for any information and the current Customer message is a direct response (single word, short phrase, or clear answer), extract it as the answer to that question
19. When extracting names from responses, consider common name patterns: single words, 2-3 word phrases, names starting with capital letters, Indian names, Western names, etc.
20. If the current message is ambiguous but could be a name/address based on context, extract it and mark in unclearInformation if needed, but STILL extract it

CRITICAL: SPECIAL REQUESTS AND CUSTOMIZATIONS EXTRACTION:
21. Extract ALL special requests, customizations, and modifications mentioned by the customer (e.g., "heart shaped", "less nuts", "extra chocolate", "no sugar", "add decorations", "make it spicy", "custom message on cake")
22. Extract delivery instructions and notes (e.g., "call before delivery", "leave at door", "deliver to reception", "ring the bell", "don't call", "deliver after 6pm")
23. Extract any preferences about product modifications (e.g., "less sweet", "more spicy", "without onions", "extra cheese")
24. Extract any preferences about packaging or presentation (e.g., "gift wrapped", "eco-friendly packaging", "special box")
25. Extract any preferences about timing or scheduling (e.g., "deliver in morning", "not before 5pm", "weekend only")
26. If customer mentions multiple special requests in one message, extract ALL of them as separate items in the specialRequests array
27. If customer mentions customizations for a specific product, include the product name in the special request (e.g., "Cake: heart shaped with less nuts")
28. Extract any notes or instructions that the customer wants the vendor to know (e.g., "please handle with care", "it's for a birthday", "surprise delivery")

CRITICAL: DELIVERY INSTRUCTIONS EXTRACTION:
29. Extract any delivery-related instructions, notes, or preferences (e.g., "call when you arrive", "leave at door", "deliver to office reception", "ring the bell twice")
30. Extract any location-specific instructions (e.g., "building is on the left", "use the back entrance", "parking available")
31. Extract any timing-related delivery instructions (e.g., "deliver between 2-4pm", "not before 10am", "weekend delivery only")
32. Extract any contact preferences for delivery (e.g., "don't call, just deliver", "call 10 minutes before", "text when you arrive")

Return ONLY valid JSON (no markdown, no code blocks, no explanations, no additional text):

{
  "keyFacts": [
    "Fact 1: Detailed description",
    "Fact 2: Detailed description"
  ],
  "customerPreferences": {
    "deliveryTime": "morning|evening|specific time|unclear",
    "deliveryDate": "specific date or relative date",
    "deliveryLocation": "address or location type",
    "deliveryInstructions": "specific delivery instructions, notes, or preferences (e.g., 'call before delivery', 'leave at door', 'ring the bell', 'deliver after 6pm')",
    "specialRequests": ["request1", "request2", "request3"],
    "dietaryRestrictions": ["restriction1", "restriction2"],
    "paymentMethod": "preferred payment method or unclear",
    "communicationStyle": "polite|casual|formal|unclear",
    "productPreferences": ["preference1", "preference2"],
    "productDislikes": ["dislike1", "dislike2"]
  },
  "customerInformation": {
    "name": "customer name or null",
    "email": "email or null",
    "phoneNumber": "phone or null",
    "addresses": ["address1", "address2"],
    "specialOccasions": [
      {
        "type": "birthday|anniversary|event|other",
        "date": "date or relative date",
        "person": "person name if mentioned",
        "details": "additional details"
      }
    ]
  },
  "ongoingTopics": [
    "Topic 1: What customer is currently discussing",
    "Topic 2: Pending questions or concerns"
  ],
  "unclearInformation": [
    "Unclear detail 1: What needs clarification",
    "Unclear detail 2: What needs clarification"
  ],
  "importantContext": [
    "Important context 1: Critical information for future responses",
    "Important context 2: Critical information for future responses"
  ]
}

IMPORTANT:
- Return ALL facts, even if they seem minor
- If information is unclear, include it in "unclearInformation" array
- Format facts as complete sentences with context
- Include both explicit and implicit information
- Preserve all customer preferences and details`;

    // Call AI with JSON response format - DIRECT CALL with retry logic
    const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

    if (!openai) {
      logger.warn({ conversationId }, 'OpenAI not configured, using fallback extraction');
      const fallbackFacts = fallbackKeywordExtraction(conversationHistory, normalizedMessage);
      return {
        keyFacts: fallbackFacts,
        customerInformation: undefined,
        customerPreferences: undefined
      };
    }

    // Helper function to validate extraction response structure
    function validateExtractionResponse(data: any): boolean {
      if (!data || typeof data !== 'object') {
        return false;
      }
      // Check for at least one expected field
      const expectedFields = ['keyFacts', 'customerPreferences', 'ongoingTopics', 'customerInformation'];
      return expectedFields.some(field => data.hasOwnProperty(field));
    }

    // Retry logic with exponential backoff
    let extractedData: any = null;
    let lastError: Error | null = null;
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Build full prompt (conversation history already included in extractionPrompt)
        const fullPrompt = extractionPrompt; // extractionPrompt already includes conversationText and currentMessageContext

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini', // Budget-optimized model
          messages: [
            {
              role: 'system',
              content: fullPrompt
            },
            {
              role: 'user',
              content: 'Extract all key facts and information from the conversation above. Return ONLY valid JSON.'
            }
          ],
          temperature: 0.2, // Low temperature for consistent JSON
          max_completion_tokens: 1000,
          response_format: { type: 'json_object' } // CRITICAL: Force JSON output
        });

        const responseText = completion.choices[0]?.message?.content || '{}';
        
        // Parse JSON response
        try {
          extractedData = JSON.parse(responseText);
        } catch (parseError) {
          // Retry with JSON extraction if wrapped in text (shouldn't happen with json_object format, but safety check)
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          } else {
            // If parsing fails, throw error to trigger fallback
            throw new Error(`No valid JSON found in response: ${responseText.substring(0, 200)}`);
          }
        }
        
        // Validate extracted data structure
        if (!validateExtractionResponse(extractedData)) {
          throw new Error('Response missing required fields');
        }
        
        // Success - break out of retry loop
        break;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delayMs = Math.pow(2, attempt) * 1000;
          logger.warn({ 
            attempt: attempt + 1, 
            maxRetries, 
            conversationId,
            errorMessage: lastError.message,
            delayMs
          }, 'Retrying AI extraction...');
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          // All retries exhausted - log detailed error and fallback
          const errorDetails = {
            conversationId,
            parseError: lastError.message,
            responsePreview: error instanceof Error && 'response' in error 
              ? String((error as any).response).substring(0, 500) 
              : 'N/A',
            extractionMethod: 'ai',
            fallbackUsed: true,
            retriesAttempted: maxRetries
          };
          
          logger.warn(errorDetails, 'Failed to parse AI extraction response after retries, using fallback');
          const fallbackFacts = fallbackKeywordExtraction(conversationHistory, normalizedMessage);
          return {
            keyFacts: fallbackFacts,
            customerInformation: undefined,
            customerPreferences: undefined
          };
        }
      }
    }

    // Final validation check
    if (!extractedData || !validateExtractionResponse(extractedData)) {
      logger.warn({ 
        extractedData: extractedData ? Object.keys(extractedData) : null, 
        conversationId 
      }, 'Invalid extraction response structure, using fallback');
      const fallbackFacts = fallbackKeywordExtraction(conversationHistory, normalizedMessage);
      return {
        keyFacts: fallbackFacts,
        customerInformation: undefined,
        customerPreferences: undefined
      };
    }

    // Combine all extracted information into keyFacts array
    const keyFacts: string[] = [];

    // Add key facts
    if (Array.isArray(extractedData.keyFacts)) {
      keyFacts.push(...extractedData.keyFacts);
    }

    // Add customer preferences as facts
    if (extractedData.customerPreferences) {
      const prefs = extractedData.customerPreferences;
      if (prefs.deliveryTime && prefs.deliveryTime !== 'unclear') {
        keyFacts.push(`Customer prefers ${prefs.deliveryTime} delivery`);
      }
      if (prefs.deliveryDate) {
        keyFacts.push(`Delivery date preference: ${prefs.deliveryDate}`);
      }
      if (prefs.deliveryLocation) {
        keyFacts.push(`Delivery location: ${prefs.deliveryLocation}`);
      }
      if (Array.isArray(prefs.specialRequests) && prefs.specialRequests.length > 0) {
        prefs.specialRequests.forEach((req: string) => {
          keyFacts.push(`Special request: ${req}`);
        });
      }
      if (Array.isArray(prefs.dietaryRestrictions) && prefs.dietaryRestrictions.length > 0) {
        prefs.dietaryRestrictions.forEach((restriction: string) => {
          keyFacts.push(`Dietary restriction: ${restriction}`);
        });
      }
      if (prefs.paymentMethod && prefs.paymentMethod !== 'unclear') {
        keyFacts.push(`Payment preference: ${prefs.paymentMethod}`);
      }
      if (prefs.communicationStyle && prefs.communicationStyle !== 'unclear') {
        keyFacts.push(`Communication style: ${prefs.communicationStyle}`);
      }
      if (Array.isArray(prefs.productPreferences) && prefs.productPreferences.length > 0) {
        prefs.productPreferences.forEach((pref: string) => {
          keyFacts.push(`Product preference: ${pref}`);
        });
      }
      if (Array.isArray(prefs.productDislikes) && prefs.productDislikes.length > 0) {
        prefs.productDislikes.forEach((dislike: string) => {
          keyFacts.push(`Product dislike: ${dislike}`);
        });
      }
    }

    // Add customer information as facts
    if (extractedData.customerInformation) {
      const info = extractedData.customerInformation;
      if (info.name) {
        keyFacts.push(`Customer name: ${info.name}`);
      }
      if (info.email) {
        keyFacts.push(`Customer email: ${info.email}`);
      }
      if (info.phoneNumber) {
        keyFacts.push(`Customer phone: ${info.phoneNumber}`);
      }
      if (Array.isArray(info.addresses) && info.addresses.length > 0) {
        info.addresses.forEach((addr: string, index: number) => {
          keyFacts.push(`Customer address ${index + 1}: ${addr}`);
        });
      }
      if (Array.isArray(info.specialOccasions) && info.specialOccasions.length > 0) {
        info.specialOccasions.forEach((occasion: any) => {
          const occasionText = occasion.person 
            ? `${occasion.type} for ${occasion.person}`
            : occasion.type;
          const dateText = occasion.date ? ` on ${occasion.date}` : '';
          const detailsText = occasion.details ? ` (${occasion.details})` : '';
          keyFacts.push(`Special occasion: ${occasionText}${dateText}${detailsText}`);
        });
      }
    }

    // Add unclear information (so we know what needs clarification)
    if (Array.isArray(extractedData.unclearInformation) && extractedData.unclearInformation.length > 0) {
      extractedData.unclearInformation.forEach((unclear: string) => {
        keyFacts.push(`[NEEDS CLARIFICATION] ${unclear}`);
      });
    }

    // Add important context
    if (Array.isArray(extractedData.importantContext) && extractedData.importantContext.length > 0) {
      keyFacts.push(...extractedData.importantContext);
    }

    // Store structured data in customer preferences for easier access
    const customerPreferences: Record<string, any> = {};
    if (extractedData.customerPreferences) {
      customerPreferences.preferences = extractedData.customerPreferences;
    }
    if (extractedData.customerInformation) {
      customerPreferences.information = extractedData.customerInformation;
    }
    if (extractedData.ongoingTopics) {
      customerPreferences.ongoingTopics = extractedData.ongoingTopics;
    }

    // Update conversation memory with structured data
    const currentMemory = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });

    if (currentMemory && Object.keys(customerPreferences).length > 0) {
      await prisma.conversationMemory.update({
        where: { conversationId },
        data: {
          customerPreferences: {
            ...(currentMemory.customerPreferences as Record<string, any> || {}),
            ...customerPreferences
          }
        }
      });
    }

    // Log extraction success
    const duration = Date.now() - startTime;
    logger.info({
      conversationId,
      extractionMethod: 'ai',
      factsExtracted: keyFacts.length,
      extractionTime: duration,
      hasCustomerInfo: !!extractedData.customerInformation,
      hasPreferences: !!extractedData.customerPreferences,
      hasUnclearInfo: Array.isArray(extractedData.unclearInformation) && extractedData.unclearInformation.length > 0,
      customerName: extractedData.customerInformation?.name,
      specialRequestsCount: Array.isArray(extractedData.customerPreferences?.specialRequests) 
        ? extractedData.customerPreferences.specialRequests.length 
        : 0,
      hasDeliveryInstructions: !!extractedData.customerPreferences?.deliveryInstructions
    }, 'AI memory extraction completed');

    // Return both keyFacts and structured data
    return {
      keyFacts: [...new Set(keyFacts)],
      customerInformation: extractedData.customerInformation || undefined,
      customerPreferences: extractedData.customerPreferences || undefined
    };

  } catch (error) {
    logger.error({ err: error, conversationId }, 'Failed to extract key facts with AI, using fallback');
    // Fallback to keyword-based extraction
    const messages = fullConversationHistory || await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { content: true, senderType: true, timestamp: true }
    });
    const fallbackFacts = fallbackKeywordExtraction(messages, normalizedMessage);
    return {
      keyFacts: fallbackFacts,
      customerInformation: undefined,
      customerPreferences: undefined
    };
  }
}

/**
 * Fallback keyword-based extraction (original implementation)
 * Used when AI extraction fails or feature flag is disabled
 */
function fallbackKeywordExtraction(
  conversationHistory: Array<{ content: string; senderType: string; timestamp?: Date }>,
  normalizedMessage: string
): string[] {
  const keyFacts: string[] = [];
  const messageText = conversationHistory
    .map(m => m.content)
    .join(' ')
    .toLowerCase();

  // Extract delivery preferences
  if (messageText.includes('morning') || messageText.includes('am')) {
    keyFacts.push('Customer prefers morning delivery');
  }
  if (messageText.includes('evening') || messageText.includes('pm')) {
    keyFacts.push('Customer prefers evening delivery');
  }

  // Extract dietary restrictions
  const dietaryKeywords = ['allergic', 'allergy', 'vegetarian', 'vegan', 'no nuts', 'gluten free'];
  for (const keyword of dietaryKeywords) {
    if (messageText.includes(keyword)) {
      keyFacts.push(`Customer mentioned: ${keyword}`);
    }
  }

  logger.info({
    extractionMethod: 'fallback',
    factsExtracted: keyFacts.length
  }, 'Using keyword-based fallback extraction');

  return keyFacts;
}

function getFallbackMemory(): ConversationMemory {
  return {
    keyFacts: [],
    ongoingTopics: [],
    customerPreferences: {},
    conversationSummary: 'Memory unavailable',
    importantContext: [],
    turnNumber: 0,
    conversationStage: 'greeting'
  };
}

