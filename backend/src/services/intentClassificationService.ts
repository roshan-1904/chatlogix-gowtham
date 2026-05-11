/**
 * Intent Classification Service
 * 
 * Classifies customer intent and extracts key information for Stage 1
 * Reference: Phase 5.2: Stage 1 - Intent Classification Service (Implementation Plan)
 */

import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { getCached, setCached } from '../utils/redis.js';
import { getIntentCacheKey, CACHE_TTL } from '../utils/cacheStrategy.js';
import { IntentClassification } from '../types/multiStage.js';
import { ConversationMemory } from './conversationMemoryService.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { calculateCostFromUsage } from '../utils/costCalculator.js';
import { 
  detectIntentFromPatterns, 
  detectIntentWithAI, 
  fallbackIntentDetection 
} from './intentDetectionService.js';
import { ConversationState } from '../types/conversationState.js';

const aiService = new AIService();
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

/**
 * Check for existing pending order
 */
async function checkExistingPendingOrder(conversationId: string, vendorId: string): Promise<any> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });

    if (!conversation || conversation.vendorId !== vendorId) {
      return null;
    }

    const pendingOrder = await prisma.order.findFirst({
      where: {
        vendorId,
        customerId: conversation.customerId,
        status: 'pending'
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        items: true,
        totalAmount: true,
        deliveryAddress: true,
        deliveryInstructions: true,
        specialRequests: true
      }
    });

    return pendingOrder;
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Error checking for pending order');
    return null;
  }
}

/**
 * Pre-check for order update patterns (before AI call)
 * This helps catch order updates that might be missed by AI
 */
function detectOrderUpdatePatterns(message: string): boolean {
  // Explicit order update patterns
  const orderUpdatePatterns = [
    /make it (?:as )?\d+/i,                    // "make it 5", "make it as 5"
    /change (?:to|it to) \d+/i,               // "change to 5", "change it to 5"
    /(?:i|we) (?:want|need|like) (?:it|them) (?:as|to be) \d+/i, // "I want it as 5"
    /(?:i|we) like to make it (?:as )?\d+/i,  // "I like to make it as 5"
    /update (?:to|quantity|qty)/i,            // "update to", "update quantity"
    /add.*more/i,                              // "add 2 more"
    /remove.*from/i,                           // "remove X from"
    /increase.*to/i,                           // "increase to"
    /decrease.*to/i                            // "decrease to"
  ];
  
  return orderUpdatePatterns.some(pattern => pattern.test(message));
}

/**
 * Detect multiple intents in a message (before AI call)
 * Helps identify when message contains multiple queries
 */
function detectMultipleIntents(message: string, existingOrder?: any): string[] {
  const lower = message.toLowerCase();
  const detected: string[] = [];
  
  // Check for greeting
  if (/^(hi|hello|hey|good morning|good evening|good afternoon|namaste|namaskar)/i.test(message)) {
    detected.push('greeting');
  }
  
  // Check for product inquiry
  const productInquiryKeywords = ['available', 'avail', 'have', 'stock', 'price', 'cost', 'what', 'which', 'tell me about', 'show me'];
  if (productInquiryKeywords.some(kw => lower.includes(kw)) || /do you have|is.*available|\?/.test(lower)) {
    detected.push('product_inquiry');
  }
  
  // Check for order update
  if (detectOrderUpdatePatterns(message) || existingOrder) {
    detected.push('order_update');
  }
  
  // Check for order new
  const orderNewKeywords = ['i want', 'i need', 'buy', 'purchase', 'order', 'give me', "i'll take", "i'd like"];
  if (orderNewKeywords.some(kw => lower.includes(kw)) && !existingOrder) {
    detected.push('order_new');
  }
  
  // Check for order status
  if (/status|where is|when will|track|last order|previous order|my order|order history/.test(lower)) {
    detected.push('order_status');
  }
  
  // Check for support
  if (/human|agent|person|talk to someone|speak to agent|customer service/.test(lower)) {
    detected.push('support');
  }
  
  // Check for confirm
  if (/confirm|yes|ok|proceed|go ahead|finalize/.test(lower) && !productInquiryKeywords.some(kw => lower.includes(kw))) {
    detected.push('confirm_order');
  }
  
  // Check for cancel
  if (/cancel|remove order|don't want|delete order|stop order/.test(lower)) {
    detected.push('cancel_order');
  }
  
  return [...new Set(detected)]; // Remove duplicates
}

/**
 * Classify customer intent with multi-intent support
 * @param disableFallback - If true, throws errors instead of using keyword fallback (useful for testing AI responses)
 */
export async function classifyIntent(
  normalizedMessage: any,
  memory: ConversationMemory,
  lastMessages: any[],
  vendorId: string,
  conversationId?: string,
  disableFallback: boolean = false,
  disableCache: boolean = false
): Promise<IntentClassification> {
  // Check cache (skip if disabled for testing)
  if (!disableCache) {
    const cacheKey = getIntentCacheKey(normalizedMessage.cleaned || normalizedMessage);
    const cached = await getCached<IntentClassification>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // Check for existing pending order if conversationId provided
    let existingOrder = null;
    if (conversationId) {
      existingOrder = await checkExistingPendingOrder(conversationId, vendorId);
    }

    // Get LAST summary (only one) for context
    let lastSummary: { summary: string; expectedNext: string } | null = null;
    if (conversationId) {
      try {
        const lastMessageWithSummary = await prisma.message.findFirst({
          where: {
            conversationId,
            senderType: 'customer',
            messageSummary: { not: null }
          },
          orderBy: { timestamp: 'desc' },
          select: {
            messageSummary: true,
            expectedNextAction: true
          }
        });
        
        if (lastMessageWithSummary?.messageSummary) {
          lastSummary = {
            summary: lastMessageWithSummary.messageSummary,
            expectedNext: lastMessageWithSummary.expectedNextAction || ''
          };
        }
      } catch (error) {
        logger.warn({ err: error, conversationId }, 'Failed to retrieve last summary');
      }
    }

    const cleanedMessage = normalizedMessage.cleaned || normalizedMessage;
    
    // ENHANCEMENT: Pre-check for order update patterns
    // If detected, add explicit hint to prompt
    const hasOrderUpdatePattern = detectOrderUpdatePatterns(cleanedMessage);
    const orderUpdateHint = hasOrderUpdatePattern && existingOrder
      ? '\n\n⚠️ CRITICAL: Message contains order update pattern ("make it X", "change to X", etc.) AND there is an existing pending order. This MUST be classified as "order_update" (primary), even if message also contains product inquiry (which should be secondary).'
      : '';

    // ENHANCEMENT: Detect multiple intents before AI call
    const detectedIntents = detectMultipleIntents(cleanedMessage, existingOrder);
    const multipleIntentHint = detectedIntents.length > 1
      ? `\n\n⚠️ MULTIPLE INTENTS DETECTED: This message appears to contain ${detectedIntents.length} intents: ${detectedIntents.join(', ')}. Make sure to identify ALL intents in your response.`
      : '';

    const prompt = buildIntentPrompt(normalizedMessage, memory, lastMessages, existingOrder, lastSummary || undefined) + orderUpdateHint + multipleIntentHint;
    
    // CRITICAL: Call OpenAI directly with JSON response format (not through generateResponse which returns conversational text)
    if (!openai) {
      throw new Error('OpenAI API key not configured');
    }
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: cleanedMessage
        }
      ],
      temperature: 0.3, // Lower temperature for more deterministic classification
      max_completion_tokens: 500,
      response_format: { type: 'json_object' } // CRITICAL: Force JSON response
    });
    
    const response = completion.choices[0]?.message?.content || '{}';
    
    // Calculate cost from first completion
    const firstCompletionCost = calculateCostFromUsage(completion.usage, 'gpt-4o-mini');

    // Try to parse JSON response with better error handling
    let parsed: any;
    let finalCost = firstCompletionCost;
    try {
      // Extract JSON from response if wrapped in text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(response);
      }
    } catch (parseError) {
      logger.warn({ response, parseError }, 'Failed to parse intent classification response, retrying...');
      
      // IMPROVEMENT: Retry with more explicit JSON instruction
      const retryPrompt = prompt + '\n\nCRITICAL: Return ONLY valid JSON, no markdown, no code blocks, no explanations.';
      
      const retryCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: retryPrompt
          },
          {
            role: 'user',
            content: cleanedMessage
          }
        ],
        temperature: 0.2, // Even lower for retry
        max_completion_tokens: 500,
        response_format: { type: 'json_object' } // CRITICAL: Force JSON response
      });
      
      const retryResponse = retryCompletion.choices[0]?.message?.content || '{}';
      
      // Calculate cost from retry completion (add to first completion cost)
      const retryCompletionCost = calculateCostFromUsage(retryCompletion.usage, 'gpt-4o-mini');
      finalCost = {
        tokensUsed: firstCompletionCost.tokensUsed + retryCompletionCost.tokensUsed,
        cost: firstCompletionCost.cost + retryCompletionCost.cost,
        model: 'gpt-4o-mini'
      };
      
      try {
        const retryJsonMatch = retryResponse.match(/\{[\s\S]*\}/);
        parsed = retryJsonMatch ? JSON.parse(retryJsonMatch[0]) : JSON.parse(retryResponse);
      } catch (retryError) {
        logger.error({ retryResponse, retryError }, 'Retry also failed, using keyword fallback');
        if (disableFallback) {
          throw new Error(`AI intent classification failed: JSON parsing error after retry. Response: ${retryResponse.substring(0, 200)}`);
        }
        return keywordBasedIntentDetection(normalizedMessage.cleaned || normalizedMessage);
      }
    }

    // IMPROVEMENT: Validate parsed result
    if (!parsed.primaryIntent) {
      logger.warn({ parsed }, 'Invalid intent classification result, using keyword fallback');
      if (disableFallback) {
        throw new Error(`AI intent classification failed: Missing primaryIntent in parsed result. Parsed: ${JSON.stringify(parsed)}`);
      }
      return keywordBasedIntentDetection(normalizedMessage.cleaned || normalizedMessage);
    }

    // ENHANCEMENT: Post-validation - if order update pattern detected but AI classified differently
    // and there's an existing order, override to order_update
    if (hasOrderUpdatePattern && existingOrder && parsed.primaryIntent !== 'order_update') {
      logger.warn({ 
        originalIntent: parsed.primaryIntent, 
        message: cleanedMessage,
        pattern: 'order_update_pattern_detected'
      }, 'Overriding intent classification: order_update pattern detected with existing order');
      
      parsed.primaryIntent = 'order_update';
      parsed.confidence = Math.max(parsed.confidence || 0.5, 0.8); // Increase confidence
      parsed.reasoning = `Order update pattern detected ("make it X", "change to X") with existing pending order. Overriding ${parsed.reasoning || 'original classification'}`;
      
      // Extract order update type if not already set
      if (!parsed.extractedInfo?.orderUpdateType) {
        parsed.extractedInfo = parsed.extractedInfo || {};
        parsed.extractedInfo.orderUpdateType = 'change_quantity'; // Default for quantity changes
      }
    }

    /**
     * Map OrderIntent type to orderUpdateType string
     */
    function mapIntentTypeToOrderUpdateType(
      intentType: 'add' | 'remove' | 'change' | 'replace' | 'confirm' | 'cancel' | 'new'
    ): 'add_items' | 'remove_items' | 'change_quantity' | 'modify_delivery' | 'replace_order' | 'partial_update' | null {
      switch (intentType) {
        case 'add':
          return 'add_items';
        case 'remove':
          return 'remove_items';
        case 'change':
          return 'change_quantity';
        case 'replace':
          return 'replace_order';
        case 'confirm':
        case 'cancel':
        case 'new':
          return null; // These don't map to orderUpdateType
        default:
          return null;
      }
    }

    // CRITICAL: Integrate intent detection service for order_update intents
    // This ensures orderUpdateType is populated correctly
    let orderUpdateType: 'add_items' | 'remove_items' | 'change_quantity' | 'modify_delivery' | 'replace_order' | 'partial_update' | null = null;
    
    if (parsed.primaryIntent === 'order_update') {
      try {
        // Step 1: Try pattern matching first (fast path - 80%+ cases)
        const patternIntent = detectIntentFromPatterns(cleanedMessage, !!existingOrder);
        
        if (patternIntent && patternIntent.confidence >= 0.8) {
          // High confidence pattern match - use it
          orderUpdateType = mapIntentTypeToOrderUpdateType(patternIntent.type);
          logger.debug({ 
            message: cleanedMessage, 
            patternIntent: patternIntent.type, 
            orderUpdateType,
            confidence: patternIntent.confidence 
          }, 'Pattern-based intent detection succeeded');
        } else {
          // Step 2: Try AI detection for ambiguous cases
          // Build conversation state for AI detection
          const conversationState: ConversationState | null = existingOrder ? {
            schemaVersion: '1.0',
            state: {
              meta: {
                vendorId,
                vendorName: '',
                conversationId: conversationId || '',
                customerId: '',
                customerPhone: '',
                locale: 'en-IN',
                currency: 'INR',
                nowIso: new Date().toISOString()
              },
              customer: {
                basicDetails: '',
                preferences: '',
                communicationStyle: '',
                deliveryAddress: existingOrder.deliveryAddress || '',
                deliveryInstructions: existingOrder.deliveryInstructions || '',
                specialRequests: existingOrder.specialRequests || ''
              },
              order: {
                status: existingOrder.status === 'pending' ? 'pending' : 'confirmed',
                items: Array.isArray(existingOrder.items) 
                  ? existingOrder.items 
                  : JSON.parse(typeof existingOrder.items === 'string' ? existingOrder.items : '[]'),
                totals: {
                  subtotal: existingOrder.totalAmount || 0,
                  tax: 0,
                  shipping: 0,
                  total: existingOrder.totalAmount || 0
                },
                deliveryDate: '',
                deliveryTime: '',
                deliveryAddress: existingOrder.deliveryAddress || '',
                deliveryInstructions: existingOrder.deliveryInstructions || '',
                specialRequests: existingOrder.specialRequests || '',
                notes: ''
              },
              productRecommendations: [],
              lastMessages: lastMessages.map(m => ({
                senderType: m.senderType || 'customer',
                content: m.content || m,
                timestamp: new Date().toISOString()
              })),
              vendor: {
                aiProducts: [],
                aiPreparationTimeMinutes: 0
              }
            },
            task: 'Detect order update intent'
          } : null;

          const aiIntent = await detectIntentWithAI(
            cleanedMessage,
            conversationState,
            memory,
            existingOrder
          );
          
          orderUpdateType = mapIntentTypeToOrderUpdateType(aiIntent.type);
          logger.debug({ 
            message: cleanedMessage, 
            aiIntent: aiIntent.type, 
            orderUpdateType,
            confidence: aiIntent.confidence 
          }, 'AI-based intent detection completed');
        }
      } catch (error) {
        logger.warn({ err: error, message: cleanedMessage }, 'Intent detection service failed, using fallback');
        
        // Step 3: Fallback detection
        const extractedItems = parsed.extractedInfo?.itemsToAdd || [];
        const fallbackIntent = fallbackIntentDetection(cleanedMessage, !!existingOrder, extractedItems);
        orderUpdateType = mapIntentTypeToOrderUpdateType(fallbackIntent.type);
        
        logger.debug({ 
          message: cleanedMessage, 
          fallbackIntent: fallbackIntent.type, 
          orderUpdateType 
        }, 'Fallback intent detection used');
      }
      
      // Override orderUpdateType in parsed result if detected
      if (orderUpdateType) {
        parsed.extractedInfo = parsed.extractedInfo || {};
        parsed.extractedInfo.orderUpdateType = orderUpdateType;
        logger.info({ 
          message: cleanedMessage, 
          orderUpdateType,
          existingOrder: !!existingOrder 
        }, 'Order update type detected and set');
      }
    }

    // cleanedMessage already declared above (line 155)
    const result: IntentClassification = {
      primaryIntent: parsed.primaryIntent || 'other',
      secondaryIntents: parsed.secondaryIntents || [],
      confidence: parsed.confidence || 0.5,
      extractedInfo: {
        products: parsed.extractedInfo?.products || [],
        quantities: parsed.extractedInfo?.quantities || [],
        orderUpdateType: parsed.extractedInfo?.orderUpdateType || null,
        itemsToAdd: parsed.extractedInfo?.itemsToAdd || [],
        itemsToRemove: parsed.extractedInfo?.itemsToRemove || [],
        quantityChanges: parsed.extractedInfo?.quantityChanges || [],
        hasDeliveryInfo: parsed.extractedInfo?.hasDeliveryInfo !== undefined 
          ? parsed.extractedInfo.hasDeliveryInfo 
          : checkForDeliveryInfo(cleanedMessage),
        hasSpecialRequests: parsed.extractedInfo?.hasSpecialRequests !== undefined
          ? parsed.extractedInfo.hasSpecialRequests
          : checkForSpecialRequests(cleanedMessage),
        mentionsOrder: parsed.extractedInfo?.mentionsOrder !== undefined
          ? parsed.extractedInfo.mentionsOrder
          : (existingOrder !== null),
        orderNumber: parsed.extractedInfo?.orderNumber || null,
        urgency: parsed.extractedInfo?.urgency || 'low',
        customerName: parsed.extractedInfo?.customerName || null,
        deliveryAddress: parsed.extractedInfo?.deliveryAddress || null
      },
      needsMoreContext: parsed.needsMoreContext !== undefined ? parsed.needsMoreContext : true,
      reasoning: parsed.reasoning || 'AI-based classification',
      tokensUsed: finalCost.tokensUsed,
      cost: finalCost.cost
    };

    // Cache result (skip if disabled for testing)
    if (!disableCache) {
      const cacheKey = getIntentCacheKey(normalizedMessage.cleaned || normalizedMessage);
      await setCached(cacheKey, result, CACHE_TTL.INTENT_CLASSIFICATION);
    }

    return result;
  } catch (error) {
    logger.error(error as Error, 'Intent classification failed');

    // Fallback: Keyword-based intent detection
    if (disableFallback) {
      throw new Error(`AI intent classification failed: ${(error as Error).message}`);
    }
    return keywordBasedIntentDetection(normalizedMessage.cleaned || normalizedMessage);
  }
}

function buildIntentPrompt(
  normalized: any,
  memory: ConversationMemory,
  lastMessages: any[],
  existingOrder?: any,
  lastSummary?: { summary: string; expectedNext: string }
): string {
  const cleanedMessage = normalized.cleaned || normalized;
  
  // QUALITY FIX: Increased fact retention from 3 to 5, topics from 2 to 3
  // Maintains quality by preserving more context while staying within token budget
  const memoryContext = memory ? `
Conversation Memory:
Summary: ${memory.conversationSummary || 'None'}
Key Facts: ${(memory.keyFacts || []).slice(0, 5).join(', ')}${(memory.keyFacts || []).length > 5 ? '...' : ''}
Ongoing Topics: ${(memory.ongoingTopics || []).slice(0, 3).join(', ')}${(memory.ongoingTopics || []).length > 3 ? '...' : ''}
Stage: ${memory.conversationStage || 'greeting'}
Turn: ${memory.turnNumber || 0}` : '';

  // QUALITY FIX: Increased from 5 to 7 messages for better context retention
  // Maintains quality by including more recent conversation history
  const previousContext = lastMessages.length > 0
    ? `Previous Messages:\n${lastMessages.slice(-7).map((m: any) => `${m.senderType || 'customer'}: ${m.content || m}`).join('\n')}\n\nConversation Summary: ${memory?.conversationSummary || 'None'}\nKey Facts: ${(memory?.keyFacts || []).slice(0, 5).join(', ') || 'None'}\nOngoing Topics: ${(memory?.ongoingTopics || []).slice(0, 3).join(', ') || 'None'}`
    : '';

  // Add existing order context if available
  const orderContext = existingOrder
    ? `\n\nEXISTING PENDING ORDER:
Order Number: ${existingOrder.orderNumber}
Items: ${JSON.stringify(existingOrder.items || [])}
Total: ₹${(existingOrder.totalAmount || 0) / 100}
Delivery Address: ${existingOrder.deliveryAddress || 'Not provided'}
Special Requests: ${existingOrder.specialRequests || 'None'}

CRITICAL: If customer provides delivery address, special requests, or updates to this order, classify as "order_update".`
    : '';

  // Add LAST summary context (if available)
  const summaryContext = lastSummary
    ? `\n\nLAST MESSAGE SUMMARY (for context):
${lastSummary.summary}

CRITICAL INSTRUCTIONS:
1. Use this summary to understand conversation flow
2. If summary says "Known Info: Customer Name: [name]", DO NOT ask for name again
3. If summary says "Missing Info: Delivery Address", you CAN ask for address
4. If summary says "Assistant asked for name" and current message is just a name, classify as "confirm_order"
5. If summary says "Expected Next: customer will provide address" and current message contains address, classify as "confirm_order" or "order_update"
6. DO NOT ask for information listed in "Known Info" section`
    : '';

  return `You are an intent classifier for a WhatsApp business assistant that works with ANY type of business (food, retail, services, etc.).

Task: Analyze the customer message and identify ALL intents present. Customers often include multiple queries in a single message.

Customer Message: "${cleanedMessage}"
${memoryContext}
${previousContext}${orderContext}${summaryContext}

CRITICAL: MULTIPLE INTENT DETECTION
- Customers frequently include multiple queries in one message
- Example: "I want to make it 5 boxes, and do you have other varieties?" → Contains BOTH order_update AND product_inquiry
- Example: "Hi, what's the price of X? Also, I need to update my delivery address" → Contains greeting + product_inquiry + order_update
- Example: "I want to order Y, and can you tell me about Z?" → Contains order_new + product_inquiry
- **ALWAYS identify ALL intents present, not just the most obvious one**
- **List primary intent (most important/actionable) and secondary intents (other queries in the message)**

CRITICAL INTENT CLASSIFICATION RULES (CHECK IN THIS PRIORITY ORDER):

1. "product_inquiry" - HIGHEST PRIORITY if message:
   - Contains availability keywords: "available", "availiable", "avail", "have", "stock", "in stock", "do you have", "do you sell", "is [something] available"
   - Asks about product/service existence: "do you have [product]?", "is [product] available?", "can I get [product]?"
   - Asks about product details: "what is [product]?", "tell me about [product]", "show me [product]", "information about [product]"
   - Asks about pricing: "price of [product]", "how much for [product]", "cost of [product]", "what's the price"
   - Mentions a product/service name followed by availability question (regardless of language or spelling)
   - Even if message contains confirmation words like "yes", "mam", "ok" - if it asks about product availability, classify as product_inquiry
   - Pattern: [Product Name] + [Availability Question] = product_inquiry
   - Pattern: [Question Word] + [Product Name] = product_inquiry
   
2. "payment_inquiry" - Payment method questions:
   - Keywords: "payment", "pay", "cash", "UPI", "card", "online payment", "COD", "cash on delivery", "payment method", "how to pay"
   - Questions about payment methods, payment process, payment security, payment timing
   - Multilingual: "cash kodukalam" (Tamil), "payment pannalam" (Tamil), "cash kodbeku" (Kannada), "payment maadbeku" (Kannada)
   - Pattern: [Payment Question] = payment_inquiry
   - Examples: 
     * "What payment methods do you accept?"
     * "Can I pay by cash?"
     * "Do you accept UPI?"
     * "online payment pannalam" (Tamil)
     * "cash kodukalam" (Tamil)
     * "What's the payment process?"
     * "Is COD available?"
   - Distinction: 
     * vs order_new: Payment inquiry asks "how to pay", order_new says "I want to order"
     * vs product_inquiry: Payment is about payment methods, product_inquiry is about products
     * vs other: Payment questions are specific and actionable

3. "delivery_inquiry" - Delivery-related questions:
   - Keywords: "deliver", "delivery", "shipping", "delivery time", "delivery cost", "free delivery", "delivery available", "deliver to", "delivery area"
   - Questions about delivery availability, time, cost, areas, locations
   - Multilingual: "delivery time" (all languages), "free delivery irukka" (Tamil), "evlo time la varum" (Tamil), "delivery ideya" (Kannada)
   - Pattern: [Delivery Question] = delivery_inquiry
   - Examples:
     * "Do you deliver to Coimbatore?"
     * "What's the delivery time?"
     * "Is free delivery available?"
     * "How long does delivery take?"
     * "free delivery irukka" (Tamil)
     * "evlo time la varum" (Tamil - how long will it take)
     * "Do you deliver to my area?"
   - Distinction:
     * vs order_status: Delivery inquiry asks "do you deliver?", order_status asks "where is my order?"
     * vs product_inquiry: Delivery is about delivery service, product_inquiry is about products
     * vs order_update: Delivery inquiry is asking, order_update is modifying (delivery updates handled via modify_delivery subtype)
   - Note: Delivery updates (changing address/time) remain as order_update with modify_delivery subtype

4. "order_status" - Asking about existing orders:
   - Status keywords: "status", "where is", "when will", "track", "tracking", "delivery status"
   - Order history: "last order", "previous order", "order details", "my order", "my orders", "order history", "past orders"
   - Pattern: Asking about something already ordered or in progress
   
5. "complaint" - Issues/complaints:
   - Keywords: "complaint", "issue", "problem", "wrong", "damaged", "broken", "bad quality", "not working", "disappointed", "poor", "late", "delayed", "missing", "incorrect"
   - Reports problems, quality issues, service complaints, delivery problems, wrong items
   - Pattern: [Problem Report] = complaint
   - Examples:
     * "My order was damaged"
     * "Wrong item received"
     * "Quality is poor"
     * "Order is late"
     * "Item is broken"
     * "Not satisfied with service"
     * "This is not what I ordered"
   - Distinction:
     * vs refund_request: Complaint reports issue, refund_request asks for money back
     * vs order_status: Complaint is negative feedback, order_status is neutral inquiry
     * vs support: Complaint is specific issue, support is general help request

6. "refund_request" - Refund requests:
   - Keywords: "refund", "return money", "money back", "reimburse", "compensation", "refund my money", "give money back"
   - Requests for money back, refund for items, payment refund inquiries
   - Multilingual: "refund venum" (Tamil), "money back venum" (Tamil), "refund beku" (Kannada)
   - Pattern: [Refund Request] = refund_request
   - Examples:
     * "I want a refund"
     * "Return my money"
     * "Refund for damaged item"
     * "Give me my money back"
     * "I need a refund"
   - Distinction:
     * vs cancel_order: Refund requests money back, cancel_order cancels order (may or may not involve refund)
     * vs return_request: Refund is about money, return_request is about returning item
     * vs complaint: Refund is action request, complaint is problem report

7. "order_new" - Placing a NEW order:
   - Ordering keywords: "I want", "I need", "buy", "purchase", "order", "give me", "I'll take", "I'd like"
   - Pattern: Customer wants to acquire something new (not modifying existing order)
   - Usually includes product name and quantity
   
8. "order_update" - Modifying EXISTING order:
   - Update keywords: "change", "update", "modify", "add", "remove", "more", "less", "increase", "decrease"
   - **Quantity change patterns:** "make it [X]", "make it as [X]", "change to [X]", "update to [X]", "I want [X] instead", "I like to make it [X]"
   - **Examples:** 
     - "make it 5 boxes" → order_update (changing quantity)
     - "make it as 5 boxes" → order_update (changing quantity)
     - "change to 3 pieces" → order_update
     - "I like to make it as 5 boxes" → order_update (even if followed by product inquiry)
   - **Pattern:** [Quantity modifier] + [Number] + [Unit] = order_update
   - **Pattern:** References existing order and wants to change it
   - **CRITICAL: If there's an existing pending order AND customer provides:**
     - Delivery address (even if just an address without other keywords)
     - Special requests or preferences
     - Delivery instructions
     - Any order-related information
     → Classify as "order_update" (not product_inquiry or order_new)
   - **CRITICAL: Mixed intents - If message contains BOTH order update AND product inquiry:**
     - Example: "i like to make it as 5 boxes, and do you have any other varieties?"
     - Classify as "order_update" (primary) with "product_inquiry" as secondary intent
     - Rule: Order modification takes priority over product inquiry when both present
   - **Pattern: AI asked for address → Customer provided address = order_update**
   - **Pattern: Customer provides address/requests after order created = order_update**
   
9. "support" - Requesting human assistance:
   - Explicit keywords: "human", "agent", "person", "talk to someone", "speak to agent", "customer service", "help me human"
   - Pattern: Explicit request to speak with a real person
   
10. "greeting" - Opening conversation:
   - Greeting keywords: "hi", "hello", "hey", "good morning", "good evening", "good afternoon", "namaste", "namaskar"
   - Pattern: Opening salutation without specific request
   
10. "cancel_order" - Canceling an order:
   - Cancel keywords: "cancel", "remove order", "don't want", "delete order", "stop order"
   - Pattern: Customer wants to cancel or remove an existing order
   
11. "confirm_order" - Confirming an order OR providing information requested:
   - Confirmation keywords: "confirm", "yes", "ok", "proceed", "go ahead", "finalize"
   - Pattern: Explicit confirmation WITHOUT asking about products
   - NOT product_inquiry: If message asks about product availability even with confirmation words, classify as product_inquiry
   - Example of confirm_order: "yes, confirm my order", "ok, proceed", "confirm"
   - Example of NOT confirm_order: "[product] available?" (even if starts with "yes" or "mam")
   - **CRITICAL: Question-Response Pattern Recognition:**
     * If the previous Assistant message asked for customer name (e.g., "What's your name?", "Could you provide your name?", "I need your name"), and the current Customer message is a single word or short phrase that looks like a name (e.g., "Murali", "John", "Ravi", "Priya", "Sarah"), classify as "confirm_order" with extractedInfo.customerName set to that name
     * If the previous Assistant message asked for delivery address, and the current Customer message contains location information (address, area name, landmark), classify as "confirm_order" or "order_update" with extractedInfo.deliveryAddress set to that address
     * Pattern: [Previous question about name/address] + [Single word/short response] = confirm_order (providing requested information)
     * Examples:
       - Assistant: "Could you please share your delivery address?" → Customer: "Murali" → This is likely a name, not address. Check if previous message asked for name.
       - Assistant: "I need your name to confirm the order" → Customer: "Murali" → confirm_order (providing name)
       - Assistant: "Could you share your delivery address?" → Customer: "123 Main Street" → confirm_order or order_update (providing address)

12. "feedback" - Positive feedback/reviews:
    - Keywords: "feedback", "review", "rating", "stars", "good", "excellent", "satisfied", "happy", "thank you", "appreciate", "great service", "loved it", "amazing", "wonderful", "perfect"
    - Positive sentiment, appreciation, reviews (after service)
    - Multilingual: "nandri" (Tamil - after service), "dhanyavadagalu" (Kannada), "romba nalla irundhuchu" (Tamil)
    - Pattern: [Positive Feedback] = feedback
    - Examples:
      * "Great service, thank you!"
      * "Product was excellent"
      * "5 stars"
      * "Very happy with order"
      * "Thank you so much"
      * "nandri" (Tamil - thank you, after service)
    - Distinction:
      * vs greeting: Feedback is after service, greeting is opening
      * vs other: Feedback is positive sentiment, other is unclear
      * vs complaint: Feedback is positive, complaint is negative

13. "return_request" - Return/exchange requests:
    - Keywords: "return", "exchange", "replace", "swap", "send back", "take back", "return item", "exchange item", "want to return"
    - Requests to return or exchange items (not money refund)
    - Multilingual: "return pannanum" (Tamil), "exchange pannanum" (Tamil), "return maadi" (Kannada)
    - Pattern: [Return Request] = return_request
    - Examples:
      * "I want to return this"
      * "Can I exchange this?"
      * "Return item"
      * "Swap this for another size"
      * "Send it back"
    - Distinction:
      * vs refund_request: Return is about item, refund is about money
      * vs cancel_order: Return is for received item, cancel is for pending order
      * vs order_update: Return removes item, order_update modifies order

14. "account_inquiry" - Account/profile questions:
    - Keywords: "account", "profile", "update address", "change phone", "my details", "personal information", "update profile", "change address", "update phone", "my account"
    - Questions about account, profile updates (not for order)
    - Pattern: [Account Question] = account_inquiry
    - Examples:
      * "Update my address"
      * "Change my phone number"
      * "My account details"
      * "Update profile"
      * "Change email address"
    - Distinction:
      * vs order_update: Account inquiry updates profile, order_update updates order
      * vs product_inquiry: Account is about customer info, product_inquiry is about products

15. "repeat_order" - Reorder requests:
    - Keywords: "repeat", "reorder", "same as last", "again", "previous order", "last time", "order again", "same order", "repeat order", "last order"
    - Requests to repeat previous orders
    - Multilingual: "same order" (all languages), "repeat pannanum" (Tamil), "repeat maadi" (Kannada)
    - Pattern: [Repeat Request] = repeat_order
    - Examples:
      * "Same as last time"
      * "Repeat my last order"
      * "Order again"
      * "Same order as before"
      * "I want the same thing"
    - Distinction:
      * vs order_new: Repeat references previous order, order_new is new order
      * vs order_status: Repeat wants to order again, order_status asks about existing order
   
16. "other" - Everything else that doesn't fit above categories

KEY DISTINCTIONS:

order_update vs product_inquiry (CRITICAL):
- "make it 5 boxes" → order_update (quantity change)
- "make it as 5 boxes" → order_update (quantity change)
- "i like to make it as 5 boxes" → order_update (quantity change)
- "make it 5 boxes, do you have other varieties?" → order_update (primary) + product_inquiry (secondary)
- "do you have [product]?" → product_inquiry (availability question)
- Rule: Quantity modification patterns ("make it X", "change to X") = order_update, even if followed by product inquiry

product_inquiry vs confirm_order:
- If message asks "is [product] available?" → product_inquiry (even with "yes" or "mam")
- If message says "yes, confirm my order" → confirm_order
- Rule: Product availability question = product_inquiry, Order confirmation = confirm_order

product_inquiry vs order_new:
- "do you have [product]?" → product_inquiry (checking availability)
- "I want [product]" → order_new (wanting to purchase)
- Rule: Question about product = product_inquiry, Statement wanting product = order_new

order_new vs order_update:
- "I want [product]" → order_new (new order)
- "add [quantity] more to my order" → order_update (modifying existing)
- "make it [X] boxes" → order_update (modifying quantity)
- Rule: New purchase = order_new, Modifying existing = order_update

MULTIPLE INTENT HANDLING:
- **Primary Intent:** The most important/actionable intent that requires immediate response
- **Secondary Intents:** Other intents present in the same message
- **Priority Rules:**
  1. If message contains order modification ("make it X", "change to X") AND product inquiry → order_update (primary), product_inquiry (secondary)
  2. If message contains order placement AND product inquiry → order_new (primary), product_inquiry (secondary)
  3. If message contains greeting AND other intent → greeting (primary), other intent (secondary)
  4. If message contains multiple product inquiries → product_inquiry (primary), product_inquiry (secondary - indicates multiple products)
  5. If message contains order update AND delivery info → order_update (primary), order_update (secondary - indicates multiple update types)

EXTRACTION GUIDELINES:
- Extract product names mentioned in the message (even if misspelled or in different language)
- Extract quantities if mentioned (numbers, units, etc.)
- Extract order update type if modifying order (add_items, remove_items, change_quantity, etc.)
- Extract information for ALL intents present (not just primary)
- Set urgency based on keywords: "urgent", "asap", "quickly" = high; "whenever" = low; default = medium

EXAMPLES OF MULTIPLE INTENTS:
1. "I like to make it as 5 boxes, and do you have any other varieties?"
   → primaryIntent: "order_update", secondaryIntents: ["product_inquiry"]
   → reasoning: "Customer wants to update quantity (order_update) and also asks about other products (product_inquiry)"

2. "Hi, what's the price of X? Also, I need to update my delivery address"
   → primaryIntent: "product_inquiry", secondaryIntents: ["order_update"]
   → reasoning: "Customer asks about price (product_inquiry) and wants to update delivery (order_update)"

3. "I want to order Y, and can you tell me about Z?"
   → primaryIntent: "order_new", secondaryIntents: ["product_inquiry"]
   → reasoning: "Customer wants to place order (order_new) and asks about another product (product_inquiry)"

4. "Hello, I need 2 boxes of X, what's the price of Y?"
   → primaryIntent: "order_new", secondaryIntents: ["product_inquiry", "greeting"]
   → reasoning: "Customer greets (greeting), wants to order (order_new), and asks about price (product_inquiry)"

Return ONLY valid JSON (no markdown, no code blocks, no explanations, no additional text):
{
  "primaryIntent": "order_new|order_update|order_status|product_inquiry|greeting|support|cancel_order|confirm_order|payment_inquiry|delivery_inquiry|complaint|refund_request|feedback|return_request|account_inquiry|repeat_order|other",
  "secondaryIntents": ["intent1", "intent2"], // ALWAYS include ALL other intents detected, even if empty array
  "confidence": 0.0-1.0,
  "extractedInfo": {
    "products": ["product1", "product2"], // Extract ALL products mentioned (for all intents)
    "quantities": ["2kg", "3 pieces"], // Extract ALL quantities mentioned
    "orderUpdateType": "add_items|remove_items|change_quantity|modify_delivery|replace_order|partial_update" | null,
    "itemsToAdd": [],
    "itemsToRemove": [],
    "quantityChanges": [{"product": "product_name", "newQuantity": 3}],
    "hasDeliveryInfo": true|false,
    "hasSpecialRequests": true|false,
    "mentionsOrder": true|false,
    "orderNumber": "ORD-123" | null,
    "urgency": "low|medium|high",
    // NEW: Additional fields for new intents (only include if relevant)
    "paymentMethod": "cash|UPI|card|online|COD" | null,        // For payment_inquiry
    "deliveryArea": "string" | null,                           // For delivery_inquiry
    "deliveryTime": "string" | null,                           // For delivery_inquiry
    "complaintType": "quality|delivery|service|wrong_item|damaged|other" | null, // For complaint
    "refundReason": "string" | null,                          // For refund_request
    "refundAmount": "number" | null,                          // For refund_request
    "feedbackType": "positive|negative|neutral" | null,       // For feedback
    "feedbackRating": "number (1-5)" | null,                 // For feedback
    "returnReason": "string" | null,                         // For return_request
    "returnItem": "string" | null,                           // For return_request
    "accountField": "address|phone|email|name|other" | null,  // For account_inquiry
    "previousOrderNumber": "ORD-123" | null,                  // For repeat_order
    "customerName": "string" | null,                          // For confirm_order when providing name in response to question
    "deliveryAddress": "string" | null                        // For confirm_order/order_update when providing address in response to question
  },
  "needsMoreContext": true|false,
  "reasoning": "brief explanation of why this intent was chosen AND what secondary intents were detected"
}`;
}
/**
 * Helper functions to detect delivery info and special requests
 */
function checkForDeliveryInfo(message: string): boolean {
  const lower = message.toLowerCase();
  const addressKeywords = ['address', 'deliver', 'location', 'place', 'where', 'road', 'street', 'area', 'pincode', 'pin code'];
  const hasAddressKeyword = addressKeywords.some(keyword => lower.includes(keyword));
  const hasNumbers = /\d/.test(message); // Addresses usually have numbers
  return hasAddressKeyword || (hasNumbers && message.length > 20); // Likely an address
}

function checkForSpecialRequests(message: string): boolean {
  const lower = message.toLowerCase();
  const requestKeywords = ['sweet', 'spicy', 'make sure', 'please', 'request', 'preference', 'like', 'want', 'need'];
  return requestKeywords.some(keyword => lower.includes(keyword));
}

function keywordBasedIntentDetection(message: string): IntentClassification {
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);
  const hasProductName = words.length >= 2; // Product names usually 2+ words
  
  let primaryIntent: IntentClassification['primaryIntent'] = 'other';
  let confidence = 0.5;

  // PRIORITY 1: Product inquiry (check FIRST - highest priority)
  const productInquiryKeywords = [
    'available', 'availiable', 'avail', 'have', 'stock', 'price', 
    'cost', 'what', 'which', 'show', 'tell', 'about'
  ];
  const hasProductInquiryKeyword = productInquiryKeywords.some(keyword => 
    lower.includes(keyword)
  );
  
  if (hasProductInquiryKeyword && hasProductName) {
    primaryIntent = 'product_inquiry';
    confidence = 0.85; // High confidence for product inquiry
  }
  // PRIORITY 2: Payment inquiry (NEW)
  else if (lower.includes('payment') || lower.includes('pay') || 
      lower.includes('cash') || lower.includes('upi') || 
      lower.includes('cod') || lower.includes('online payment') ||
      lower.includes('cash kodukalam') || lower.includes('payment pannalam') ||
      lower.includes('cash kodbeku') || lower.includes('payment maadbeku') ||
      lower.includes('cash kodukkam') || lower.includes('payment cheyyam') ||
      lower.includes('cash ivvachu') || lower.includes('payment cheyachu') ||
      lower.includes('payment method') || lower.includes('how to pay')) {
    primaryIntent = 'payment_inquiry';
    confidence = 0.85;
  }
  // PRIORITY 3: Delivery inquiry (NEW)
  else if (lower.includes('deliver') || lower.includes('delivery') || 
           lower.includes('shipping') || lower.includes('delivery time') ||
           lower.includes('free delivery') || lower.includes('delivery cost') ||
           lower.includes('delivery irukka') || lower.includes('delivery ideya') ||
           lower.includes('delivery unda') || lower.includes('delivery undha') ||
           lower.includes('evlo time la varum') || lower.includes('yestu time ge barutte') ||
           lower.includes('ethra time il varum') || lower.includes('enta time ki vastundi') ||
           lower.includes('deliver to') || lower.includes('delivery area')) {
    primaryIntent = 'delivery_inquiry';
    confidence = 0.85;
  }
  // PRIORITY 4: Complaint (NEW)
  else if (lower.includes('complaint') || lower.includes('issue') || 
           lower.includes('problem') || lower.includes('wrong') ||
           lower.includes('damaged') || lower.includes('broken') ||
           lower.includes('bad quality') || lower.includes('not working') ||
           lower.includes('disappointed') || lower.includes('poor') ||
           lower.includes('late') || lower.includes('delayed') ||
           lower.includes('missing') || lower.includes('incorrect')) {
    primaryIntent = 'complaint';
    confidence = 0.8;
  }
  // PRIORITY 5: Refund request (NEW)
  else if (lower.includes('refund') || lower.includes('return money') ||
           lower.includes('money back') || lower.includes('reimburse') ||
           lower.includes('refund venum') || lower.includes('money back venum') ||
           lower.includes('refund beku') || lower.includes('money back beku') ||
           lower.includes('refund vende') || lower.includes('money back vende') ||
           lower.includes('refund kavali') || lower.includes('money back kavali')) {
    primaryIntent = 'refund_request';
    confidence = 0.8;
  }
  // PRIORITY 6: Support
  else if (lower.includes('human') || lower.includes('agent') || lower.includes('support') || lower.includes('customer service')) {
    primaryIntent = 'support';
    confidence = 0.9;
  }
  // PRIORITY 7: Order status
  else if (lower.includes('status') ||
    lower.includes('where') ||
    lower.includes('when') ||
    lower.includes('track') ||
    lower.includes('last order') ||
    lower.includes('previous order') ||
    lower.includes('order details') ||
    lower.includes('my order') ||
    lower.includes('my orders') ||
    lower.includes('order history') ||
    lower.includes('past order')) {
    primaryIntent = 'order_status';
    confidence = 0.8;
  }
  // PRIORITY 8: Greeting
  else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey') || lower.includes('good morning') || lower.includes('good evening')) {
    primaryIntent = 'greeting';
    confidence = 0.8;
  }
  // PRIORITY 9: Cancel order
  else if (lower.includes('cancel') || lower.includes('remove order')) {
    primaryIntent = 'cancel_order';
    confidence = 0.7;
  }
  // PRIORITY 10: Order update (ENHANCED with quantity change patterns)
  const orderUpdatePatterns = [
    /make it (?:as )?(\d+)/i,           // "make it 5", "make it as 5"
    /change (?:to|it to) (\d+)/i,      // "change to 5", "change it to 5"
    /update (?:to|quantity|qty)/i,     // "update to", "update quantity"
    /(?:i|we) (?:want|need|like) (?:it|them) (?:as|to be) (\d+)/i, // "I want it as 5"
    /(?:i|we) like to make it (?:as )?(\d+)/i, // "I like to make it as 5"
    /modify/i,
    /add.*more/i,
    /remove.*from/i,
    /increase/i,
    /decrease/i
  ];
  
  const hasOrderUpdatePattern = orderUpdatePatterns.some(pattern => pattern.test(message));
  
  if (hasOrderUpdatePattern || lower.includes('update') || lower.includes('change') || lower.includes('modify')) {
    primaryIntent = 'order_update';
    confidence = 0.75; // Increased confidence for pattern-based detection
  }
  // PRIORITY 11: New order
  else if (lower.includes('order') || lower.includes('buy') || lower.includes('want') || lower.includes('need')) {
    primaryIntent = 'order_new';
    confidence = 0.7;
  }
  // PRIORITY 12: Confirm order (lowest priority - only if explicit confirmation)
  else if ((lower.includes('confirm') || lower.includes('yes') || lower.includes('ok')) && 
           !hasProductInquiryKeyword) {
    primaryIntent = 'confirm_order';
    confidence = 0.6;
  }
  // PRIORITY 13: Feedback (NEW - Priority 2)
  else if (lower.includes('feedback') || lower.includes('review') ||
           lower.includes('rating') || lower.includes('stars') ||
           (lower.includes('thank') && lower.includes('you')) ||
           lower.includes('great') || lower.includes('excellent') ||
           lower.includes('satisfied') || lower.includes('happy') ||
           lower.includes('nandri') || lower.includes('dhanyavadagalu') ||
           lower.includes('romba nalla') || lower.includes('super') ||
           lower.includes('amazing') || lower.includes('wonderful') ||
           lower.includes('perfect') || lower.includes('loved it')) {
    primaryIntent = 'feedback';
    confidence = 0.75;
  }
  // PRIORITY 14: Return request (NEW - Priority 2)
  else if ((lower.includes('return') && !lower.includes('money')) ||
           lower.includes('exchange') || lower.includes('replace') ||
           lower.includes('swap') || lower.includes('send back') ||
           lower.includes('return pannanum') || lower.includes('exchange pannanum') ||
           lower.includes('return maadi') || lower.includes('exchange maadi') ||
           lower.includes('return cheyyanam') || lower.includes('exchange cheyyanam') ||
           lower.includes('return cheyali') || lower.includes('exchange cheyali')) {
    primaryIntent = 'return_request';
    confidence = 0.75;
  }
  // PRIORITY 15: Account inquiry (NEW - Priority 2)
  else if (lower.includes('account') || lower.includes('profile') ||
           lower.includes('update address') || lower.includes('change phone') ||
           lower.includes('my details') || lower.includes('personal information') ||
           lower.includes('update profile') || lower.includes('change address') ||
           lower.includes('update phone') || lower.includes('my account')) {
    primaryIntent = 'account_inquiry';
    confidence = 0.7;
  }
  // PRIORITY 16: Repeat order (NEW - Priority 2)
  else if (lower.includes('repeat') || lower.includes('reorder') ||
           lower.includes('same as last') || lower.includes('again') ||
           lower.includes('previous order') || lower.includes('last time') ||
           lower.includes('order again') || lower.includes('same order') ||
           lower.includes('repeat pannanum') || lower.includes('repeat maadi')) {
    primaryIntent = 'repeat_order';
    confidence = 0.7;
  }
  // PRIORITY 17: Product inquiry fallback (if product name detected)
  else if (hasProductName && words.length >= 3) {
    primaryIntent = 'product_inquiry';
    confidence = 0.6;
  }

  return {
    primaryIntent,
    confidence,
    extractedInfo: {
      hasDeliveryInfo: false,
      hasSpecialRequests: false,
      mentionsOrder: false,
      urgency: 'low'
    },
    needsMoreContext: true,
    reasoning: 'Keyword-based fallback detection',
    tokensUsed: 0,
    cost: 0
  };
}

