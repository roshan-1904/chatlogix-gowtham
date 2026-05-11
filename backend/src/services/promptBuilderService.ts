/**
 * Prompt Builder Service
 * 
 * Builds focused prompts with only necessary context for Stage 3
 * Reference: Phase 5.4: Stage 3 - Prompt Builder Service (Implementation Plan)
 */

import { ConversationMemory } from './conversationMemoryService.js';
import { shouldAskForDeliveryDate, getPreparationTimeMessage } from '../types/orderSettings.js';

/**
 * Build focused prompt with only necessary context
 * Target: 500-800 tokens (vs 3000-4000 in legacy)
 */
export function buildFocusedPrompt(
  intent: string,
  extractedInfo: any,
  fetchedData: any,
  vendorConfig: any,
  memory: ConversationMemory,
  lastMessages?: any[],
  fullConversationHistory?: any[], // ENHANCEMENT: Full conversation history for better context
  secondaryIntents?: string[] // ENHANCEMENT: Secondary intents for multiple intent handling
): string {
  const basePrompt = getBasePromptForIntent(intent, vendorConfig, secondaryIntents);
  const contextSections: string[] = [];
  
  // Add customer messages for context
  if (lastMessages && lastMessages.length > 0) {
    const customerMessages = lastMessages
      .filter((m: any) => m.senderType === 'customer')
      .slice(-3)
      .map((m: any) => m.content || m)
      .join('\n');
    
    if (customerMessages) {
      contextSections.push(`Recent Customer Messages:\n${customerMessages}`);
    }
  }
  
  // QUALITY FIX: Intent-specific context windows for better quality
  // Use more context for order-related intents that need detailed history
  const contextWindow = (intent === 'order_status' || intent === 'order_update' || intent === 'complaint') 
    ? 15  // More context for order-related intents
    : 10; // Standard context for other intents
  
  if (fullConversationHistory && fullConversationHistory.length > 0) {
    const historyText = fullConversationHistory
      .slice(-contextWindow) // Intent-specific context window
      .map((m: any) => `${m.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${m.content}`)
      .join('\n');
    
    contextSections.push(`Recent Conversation History (Last ${contextWindow} messages):\n${historyText}`);
  }
  
  // QUALITY FIX: Increased fact retention from 3 to 5, topics from 2 to 3
  // Maintains quality by preserving more context while staying within token budget
  if (memory) {
    const keyFactsSummary = (memory.keyFacts || []).slice(0, 5).join('; ');
    const topicsSummary = (memory.ongoingTopics || []).slice(0, 3).join('; ');
    
    // NEW: Extract customer info from memory for explicit usage instructions
    const customerName = memory.customerPreferences?.information?.name || 
                        memory.customerPreferences?.customerName || null;
    const deliveryAddress = memory.customerPreferences?.deliveryAddress || 
                           memory.customerPreferences?.primaryDeliveryAddress || null;
    
    contextSections.push(`Conversation Memory:
- Summary: ${memory.conversationSummary || 'None'}
- Key Facts: ${keyFactsSummary || 'None'}${(memory.keyFacts || []).length > 5 ? '...' : ''}
- Topics: ${topicsSummary || 'None'}${(memory.ongoingTopics || []).length > 3 ? '...' : ''}
- Stage: ${memory.conversationStage || 'greeting'}
- Turn: ${memory.turnNumber || 0}
${customerName ? `- Customer Name: ${customerName} (USE THIS, don't ask)` : '- Customer Name: Not provided'}
${deliveryAddress ? `- Delivery Address: ${deliveryAddress} (USE THIS, don't ask)` : '- Delivery Address: Not provided'}

CRITICAL: Use information from memory above. DO NOT ask for information that already exists in memory.`);
    
    // Include preferences only if relevant
    if (memory.customerPreferences && Object.keys(memory.customerPreferences).length > 0) {
      const prefsSummary = Object.entries(memory.customerPreferences)
        .slice(0, 2)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      contextSections.push(`Preferences: ${prefsSummary}`);
    }
    
    // Include last order summary if available
    if (memory.lastOrderSummary) {
      contextSections.push(`Last Order: ${memory.lastOrderSummary}`);
    }
  }
  
  // ENHANCEMENT: Add detailed order context for order_update intents
  if (intent === 'order_update') {
    if (fetchedData?.pendingOrder) {
      const order = fetchedData.pendingOrder;
      const orderItems = parseOrderItems(order.items);
      const orderUpdateType = extractedInfo?.orderUpdateType;
      
      // Build detailed order context
      let orderContext = `CURRENT ORDER DETAILS:\n`;
      orderContext += `- Order Number: ${order.orderNumber || order.id || 'N/A'}\n`;
      orderContext += `- Status: ${order.status || 'pending'}\n`;
      orderContext += `- Current Total: ${formatAmount(order.totalAmount || 0)}\n`;
      orderContext += `- Current Items:\n`;
      
      if (orderItems.length > 0) {
        orderItems.forEach((item: any, index: number) => {
          const productName = item.product || item.name || 'Unknown';
          const quantity = item.quantity || 0;
          orderContext += `  ${index + 1}. ${productName} x${quantity}\n`;
        });
      } else {
        orderContext += `  (No items)\n`;
      }
      
      if (order.deliveryAddress) {
        orderContext += `- Delivery Address: ${order.deliveryAddress}\n`;
      }
      if (order.deliveryInstructions) {
        orderContext += `- Delivery Instructions: ${order.deliveryInstructions}\n`;
      }
      if (order.specialRequests) {
        orderContext += `- Special Requests: ${order.specialRequests}\n`;
      }
      
      // Add intent-specific instructions based on orderUpdateType
      if (orderUpdateType === 'add_items') {
        orderContext += `\nCRITICAL: Customer wants to ADD items to this order. Extract new items and ADD them to existing items. DO NOT replace the order.\n`;
        orderContext += `CRITICAL: In extractedData, set orderUpdateType to "add_items" to ensure correct database handling.\n`;
      } else if (orderUpdateType === 'remove_items') {
        orderContext += `\nCRITICAL: Customer wants to REMOVE items from this order. Extract items to remove and REMOVE them from existing items. Ensure at least one item remains.\n`;
        orderContext += `CRITICAL: In extractedData, set orderUpdateType to "remove_items" to ensure correct database handling.\n`;
      } else if (orderUpdateType === 'change_quantity') {
        orderContext += `\nCRITICAL: Customer wants to CHANGE quantities of items in this order. Extract quantity changes and UPDATE quantities. DO NOT replace the order.\n`;
        orderContext += `CRITICAL: In extractedData, set orderUpdateType to "change_quantity" to ensure correct database handling.\n`;
      } else if (orderUpdateType === 'replace_order') {
        orderContext += `\nCRITICAL: Customer wants to REPLACE the entire order. Extract new items and REPLACE all existing items.\n`;
        orderContext += `CRITICAL: In extractedData, set orderUpdateType to "replace_order" to ensure correct database handling.\n`;
      } else {
        orderContext += `\nCRITICAL: Customer wants to update this order. Extract items and update accordingly. If unclear, default to ADDING items (safest option).\n`;
        orderContext += `CRITICAL: In extractedData, set orderUpdateType to "add_items" (safest default) to ensure correct database handling.\n`;
      }
      
      contextSections.push(orderContext);
    } else {
      // No existing order - treat as new order
      contextSections.push(`CURRENT ORDER: No existing order found. This will be treated as a NEW order.`);
    }
  } else if (intent.includes('order')) {
    // For other order intents, show basic order context
    if (fetchedData?.pendingOrder) {
      contextSections.push(`Current Order: ${formatOrder(fetchedData.pendingOrder)}`);
    }
  }
  
  // Add order history for order_status intent - CRITICAL for providing order details
  if (intent === 'order_status' && fetchedData?.orderHistory) {
    if (fetchedData.orderHistory.length > 0) {
      contextSections.push(`Order History (Last ${fetchedData.orderHistory.length} orders):\n${formatOrderHistory(fetchedData.orderHistory)}`);
    } else {
      contextSections.push(`Order History: No previous orders found for this customer.`);
    }
  }
  
  // Also include order history for greeting intent (for repeat order suggestions)
  if (intent === 'greeting' && fetchedData?.orderHistory && fetchedData.orderHistory.length > 0) {
    contextSections.push(`Customer's Recent Orders:\n${formatOrderHistory(fetchedData.orderHistory.slice(0, 3))}`);
  }
  
  // Add payment context for payment_inquiry
  if (intent === 'payment_inquiry' && fetchedData?.vendorConfig) {
    const paymentConfig = fetchedData.vendorConfig.paymentConfig;
    if (paymentConfig) {
      const methods = paymentConfig.methods || ['Cash', 'UPI', 'Online'];
      contextSections.push(`Available Payment Methods: ${methods.join(', ')}`);
      if (paymentConfig.defaultMethod) {
        contextSections.push(`Default Payment Method: ${paymentConfig.defaultMethod}`);
      }
      if (paymentConfig.codAvailable !== undefined) {
        contextSections.push(`COD Available: ${paymentConfig.codAvailable ? 'Yes' : 'No'}`);
      }
    }
  }
  
  // Add delivery context for delivery_inquiry
  if (intent === 'delivery_inquiry' && fetchedData?.vendorConfig) {
    const deliveryConfig = fetchedData.vendorConfig.deliveryConfig;
    if (deliveryConfig) {
      if (deliveryConfig.areas && Array.isArray(deliveryConfig.areas)) {
        contextSections.push(`Delivery Areas: ${deliveryConfig.areas.join(', ')}`);
      }
      if (deliveryConfig.time) {
        contextSections.push(`Delivery Time: ${deliveryConfig.time}`);
      }
      if (deliveryConfig.freeDeliveryThreshold) {
        contextSections.push(`Free Delivery Threshold: ₹${deliveryConfig.freeDeliveryThreshold}`);
      }
    }
  }
  
  // Add order history for repeat_order
  if (intent === 'repeat_order' && fetchedData?.orderHistory && fetchedData.orderHistory.length > 0) {
    const lastOrder = fetchedData.orderHistory[0];
    contextSections.push(`Last Order Details:\n${formatOrder(lastOrder)}\n\nUse this to pre-fill the repeat order.`);
  }
  
  // Add order context for complaint and refund_request
  if ((intent === 'complaint' || intent === 'refund_request') && fetchedData?.pendingOrder) {
    contextSections.push(`Order Context:\n${formatOrder(fetchedData.pendingOrder)}`);
  }
  
  // Add order history for complaint
  if (intent === 'complaint' && fetchedData?.orderHistory && fetchedData.orderHistory.length > 0) {
    contextSections.push(`Recent Orders:\n${formatOrderHistory(fetchedData.orderHistory.slice(0, 3))}`);
  }
  
  // Add delivery info if mentioned
  if (extractedInfo?.hasDeliveryInfo) {
    contextSections.push(`Delivery Info: ${extractDeliveryInfo(extractedInfo)}`);
  }
  
  // Add product context for inquiries - ALL available products (not just 5)
  if (intent === 'product_inquiry' && fetchedData?.products && fetchedData.products.length > 0) {
    // If customer mentioned specific products, show matching products first, then all products
    if (fetchedData?.matchingProducts && fetchedData.matchingProducts.length > 0) {
      contextSections.push(`PRODUCTS MENTIONED BY CUSTOMER (likely matches):\n${formatRelevantProducts(fetchedData.matchingProducts)}`);
      contextSections.push(`ALL AVAILABLE PRODUCTS (use keywords to match customer queries):\n${formatRelevantProducts(fetchedData.products)}`);
    } else {
      // Include ALL products so AI knows exactly what's available
      contextSections.push(`AVAILABLE PRODUCTS (match customer query using keywords and product names):\n${formatRelevantProducts(fetchedData.products)}`);
    }
  } else if (intent === 'product_inquiry' && (!fetchedData?.products || fetchedData.products.length === 0)) {
    // If no products, explicitly tell AI
    contextSections.push(`AVAILABLE PRODUCTS: No products in catalog. DO NOT mention any specific products.`);
  }
  
  // Add product context for order intents - include ALL products for validation
  if ((intent === 'order_new' || intent === 'order_update') && fetchedData?.products) {
    if (extractedInfo?.products && extractedInfo.products.length > 0) {
      // Filter to mentioned products first
      const mentionedProducts = fetchedData.products.filter((p: any) =>
        extractedInfo.products.some((mentioned: string) =>
          p.name.toLowerCase().includes(mentioned.toLowerCase()) ||
          (p.keywords && Array.isArray(p.keywords) && p.keywords.some((k: string) => 
            k.toLowerCase().includes(mentioned.toLowerCase())
          ))
        )
      );
      if (mentionedProducts.length > 0) {
        contextSections.push(`PRODUCTS MENTIONED BY CUSTOMER (validate against these):\n${formatRelevantProducts(mentionedProducts)}`);
      }
      // Also include all products for reference
      contextSections.push(`ALL AVAILABLE PRODUCTS (ONLY use these - do not invent):\n${formatRelevantProducts(fetchedData.products)}`);
    } else {
      // No specific products mentioned, include all for reference
      contextSections.push(`ALL AVAILABLE PRODUCTS (ONLY use these - do not invent):\n${formatRelevantProducts(fetchedData.products)}`);
    }
  }
  
  // For greeting, include all products so AI can mention them
  if (intent === 'greeting' && fetchedData?.products && fetchedData.products.length > 0) {
    contextSections.push(`AVAILABLE PRODUCTS (you can mention these):\n${formatRelevantProducts(fetchedData.products)}`);
  }
  
  // Customer insights - CRITICAL: Prevent asking for repeated information
  if (fetchedData?.insights && needsCustomerContext(intent)) {
    const insights = fetchedData.insights;
    const customerInfoSection = formatCustomerInsightsForPrompt(insights);
    if (customerInfoSection) {
      contextSections.push(`CRITICAL: Customer Information Available:\n${customerInfoSection}\n\nDO NOT ask for information that is already available above. Use existing information instead.`);
    }
  }
  
  // CRITICAL: For order_new intent, check if customer name is missing and add explicit instruction
  if (intent === 'order_new') {
    const customerNameInMemory = memory?.customerPreferences?.information?.name || 
                                memory?.customerPreferences?.customerName || null;
    const customerNameInInsights = fetchedData?.insights?.customerName || null;
    
    if (!customerNameInMemory && !customerNameInInsights) {
      contextSections.push(`⚠️ MISSING CRITICAL INFORMATION FOR ORDER:\n` +
        `- Customer Name: NOT PROVIDED\n` +
        `ACTION REQUIRED: You MUST ask for the customer's name before confirming the order.\n` +
        `Ask naturally: "Could you please provide your name so I can confirm your order?" or "May I have your name for the order?"`);
    }

    // NEW: Check if vendor requires preferred delivery date
    const vendorSettings = fetchedData?.vendorOrderSettings;
    if (vendorSettings) {
      const needsDeliveryDate = shouldAskForDeliveryDate(
        vendorSettings.category,
        vendorSettings.askForPreferredDeliveryDate
      );
      
      // Check if delivery date is already in memory or conversation state
      const deliveryDateInMemory = memory?.customerPreferences?.deliveryDate || null;
      const deliveryDateInState = fetchedData?.conversationState?.order?.deliveryDate || null;
      
      if (needsDeliveryDate && !deliveryDateInMemory && !deliveryDateInState) {
        contextSections.push(`⚠️ DELIVERY DATE REQUIRED:\n` +
          `- Preferred Delivery Date: NOT PROVIDED\n` +
          `ACTION REQUIRED: You MUST ask for the customer's preferred delivery date.\n` +
          `Ask naturally: "What's your preferred delivery date?" or "When would you like your order delivered?"\n` +
          `Accept formats: "tomorrow", "tomorrow evening", "31st October", "next Monday", etc.`);
      }
    }
  }
  
  const context = contextSections.length > 0 
    ? `\n\nContext:\n${contextSections.join('\n\n')}`
    : '';
  
  return `${basePrompt}${context}`;
}

function getBasePromptForIntent(intent: string, vendorConfig: any, secondaryIntents?: string[]): string {
  const botName = vendorConfig?.aiBotName || 'AI assistant';
  const businessName = vendorConfig?.businessName || 'business';
  
  // Build base prompt from sections or fallback to aiSystemPrompt
  const sections: string[] = [];
  
  // Base prompt (from aiSystemPrompt if exists, otherwise default)
  const basePrompt = vendorConfig?.aiSystemPrompt || `You are ${botName}, a helpful WhatsApp assistant for ${businessName}.`;
  sections.push(basePrompt);
  
  // Add Delivery Instructions section
  if (vendorConfig?.aiDeliveryInstructions) {
    sections.push(`\n\n## Delivery Instructions\n${vendorConfig.aiDeliveryInstructions}`);
  }
  
  // Add Pickup/Delivery Address section
  if (vendorConfig?.aiPickupDeliveryAddress) {
    sections.push(`\n\n## Pickup / Delivery Address\n${vendorConfig.aiPickupDeliveryAddress}`);
  }
  
  // Add Tone Example section
  if (vendorConfig?.aiToneExample) {
    sections.push(`\n\n## Tone Example\n${vendorConfig.aiToneExample}`);
  }
  
  const fullBasePrompt = sections.join('');
  const personality = vendorConfig?.aiPersonality || 'Be friendly, warm, and helpful.';
  
  // Add intent-specific instructions
  let intentInstructions = '';
  switch(intent) {
    case 'order_new':
      intentInstructions = '\n\nCurrent Task: Help the customer place a new order. Gather product details, quantities, delivery information, and customer name.\n' +
        'CRITICAL: Before confirming the order, you MUST collect:\n' +
        '1. Customer name (if not already in memory)\n' +
        '2. Product details and quantities\n' +
        '3. Delivery address\n' +
        '4. Preferred delivery date (if vendor requires it - you will be notified in context)\n' +
        'If customer name is missing, ask for it: "Could you please provide your name so I can confirm your order?"\n' +
        'If preferred delivery date is required and missing, ask: "What\'s your preferred delivery date?"';
      break;
    case 'order_update':
      intentInstructions = '\n\nCurrent Task: Help the customer update their existing order.';
      break;
    case 'order_status':
      intentInstructions = '\n\nCurrent Task: Provide information about the customer\'s order status and order history.\nCRITICAL: Use the Order History provided below to answer customer questions about their previous orders. If order history is provided, you MUST use it to give specific order details. DO NOT say you don\'t have access to order details if order history is provided.';
      break;
    case 'product_inquiry':
      intentInstructions = '\n\nCurrent Task: Answer questions about products, pricing, and availability.';
      break;
    case 'greeting':
      intentInstructions = '\n\nCurrent Task: Greet the customer warmly and offer assistance.';
      break;
    case 'payment_inquiry':
      intentInstructions = '\n\nCurrent Task: Answer questions about payment methods, payment process, and payment options.\n- If payment methods are available in vendor config, list them clearly\n- Explain payment process if asked\n- Store customer payment preferences if mentioned';
      break;
    case 'delivery_inquiry':
      intentInstructions = '\n\nCurrent Task: Answer questions about delivery availability, delivery time, delivery areas, and delivery charges.\n- If delivery areas are available in vendor config, mention them\n- Provide delivery time estimates\n- Explain delivery charges and free delivery thresholds if applicable';
      break;
    case 'complaint':
      intentInstructions = '\n\nCurrent Task: Handle customer complaints professionally and empathetically.\n- Acknowledge the issue\n- Apologize if appropriate\n- Offer solutions (refund, replacement, etc.)\n- Escalate to vendor if needed\n- Log complaint details for tracking\n- IMPORTANT: If the customer says the price is wrong, incorrect, or disputes the total, set extractedData.complaintType to "price_dispute". The system will automatically recalculate the order total.\n- Other complaintType values: "quality", "wrong_item", "damaged", "late_delivery", "missing_item", "other"';
      break;
    case 'refund_request':
      intentInstructions = '\n\nCurrent Task: Process refund requests.\n- Check refund eligibility based on order status and vendor policy\n- Explain refund process\n- Initiate refund if eligible\n- Provide timeline for refund processing';
      break;
    case 'feedback':
      intentInstructions = '\n\nCurrent Task: Acknowledge and appreciate customer feedback.\n- Thank the customer for their feedback\n- Store feedback for vendor insights\n- Use positive feedback for testimonials if appropriate';
      break;
    case 'return_request':
      intentInstructions = '\n\nCurrent Task: Handle return and exchange requests.\n- Check return policy\n- Process return/exchange request\n- Provide return instructions\n- Generate return label if needed';
      break;
    case 'account_inquiry':
      intentInstructions = '\n\nCurrent Task: Help with account and profile management.\n- Update customer information as requested\n- Confirm updates with customer\n- Store changes in customer insights';
      break;
    case 'repeat_order':
      intentInstructions = '\n\nCurrent Task: Help customer repeat their previous order.\n- Fetch last order details from order history\n- Pre-fill order with previous items\n- Confirm with customer before placing\n- Check if products are still available';
      break;
    case 'confirm_order':
      intentInstructions = '\n\nCurrent Task: Confirm the customer\'s pending order.\n' +
        'CRITICAL INSTRUCTIONS:\n' +
        '- The customer has ALREADY confirmed (said "yes", "confirm", "proceed", etc.) - DO NOT ask for confirmation again\n' +
        '- Acknowledge the confirmation: "Thank you for confirming!" or "Perfect! Your order is confirmed!"\n' +
        '- Confirm order details clearly (items, quantities, total, delivery address)\n' +
        '- Thank the customer for their order\n' +
        '- Provide next steps (preparation time, delivery estimate if available)\n' +
        '- Mark the order as confirmed in your response\n' +
        '- DO NOT ask "Shall I proceed?" or "Would you like to proceed?" - they already confirmed!\n' +
        '- DO NOT ask for confirmation again - the order should be finalized\n' +
        '- If order details are in context, reference them specifically';
      break;
    case 'cancel_order':
      intentInstructions = '\n\nCurrent Task: Handle the customer\'s order cancellation request.\n' +
        'CRITICAL INSTRUCTIONS:\n' +
        '- The customer wants to CANCEL their order - acknowledge this clearly\n' +
        '- Reference the order being canceled (order number, items, total)\n' +
        '- Confirm cancellation clearly: "Your order has been canceled" or "I\'ve canceled your order"\n' +
        '- Be empathetic and understanding\n' +
        '- Offer to help with a new order if appropriate\n' +
        '- Thank the customer\n' +
        '- DO NOT ask for confirmation - they already requested cancellation\n' +
        '- If order details are in context, reference them specifically';
      break;
    case 'other':
      intentInstructions = '\n\nCurrent Task: Help the customer with their request.\n' +
        '- Try to understand what they need\n' +
        '- Ask clarifying questions if needed\n' +
        '- Be helpful and friendly';
      break;
  }
  
  // ENHANCEMENT: Add multiple intent handling instructions
  let multipleIntentInstructions = '';
  if (secondaryIntents && secondaryIntents.length > 0) {
    multipleIntentInstructions = `\n\n⚠️ MULTIPLE INTENTS DETECTED:
Primary Intent: ${intent}
Secondary Intents: ${secondaryIntents.join(', ')}

CRITICAL: You MUST address ALL intents in your response:
1. Handle the primary intent (${intent}) first and completely
2. Then address secondary intents naturally in the same response
3. Use natural transitions like "Also, regarding your question about..." or "By the way, about..."
4. Make sure to answer ALL questions asked by the customer
5. Do NOT ignore secondary intents - they are part of the customer's message

Examples:
- If primary is "order_update" and secondary is "product_inquiry": 
  → First: Handle the order update, then answer the product question
- If primary is "order_new" and secondary is "product_inquiry":
  → First: Process the order, then provide product information
- If primary is "greeting" and secondary is "product_inquiry":
  → First: Greet warmly, then answer the product question

Remember: Customers often ask multiple things in one message. Address everything naturally.`;
  }
  
  // CRITICAL: Add strict product rules (vendor-agnostic, multi-language)
  const productRules = `
  
CRITICAL PRODUCT RULES - STRICTLY ENFORCE:
- ONLY mention products that are explicitly listed in the "AVAILABLE PRODUCTS" section below
- Match customer queries using KEYWORDS and product names - be flexible with matching
- Support multi-language matching: Customer may ask in different language than product names
- Use product keywords to match partial queries and typos
- DO NOT say "I don't have that product" if a similar product exists - instead say "I have [similar product name] which includes [what customer asked for]"
- If customer asks about something and you have a matching product (by keyword or name), ALWAYS show it - don't say it's unavailable
- **CRITICAL: If customer asks about a product that is NOT in the "AVAILABLE PRODUCTS" list, you MUST say "I don't have [product name] in my catalog" or "Sorry, I don't have [product name] available"**
- DO NOT mention products that aren't in the catalog
- DO NOT default to other products when asked product is not available
- Only say "I don't have that product" if NO products match the customer's query at all
- Always use EXACT product names from the catalog when mentioning products
- If no products are provided in context, DO NOT mention any specific products - ask customer what they're looking for instead

CRITICAL EXTRACTION RULES (for orderItems):
- Only extract orderItems if product name can be matched to products in "AVAILABLE PRODUCTS"
- Match products using keywords, partial names, and fuzzy matching (handles typos)
- If customer mentions a product that doesn't exist in catalog, use empty array: []
- If product name is unclear or ambiguous, use empty array: []
- NEVER use "Unknown", "N/A", or placeholder values for product names
- Support multi-language matching: If customer message is in different language than product names, use semantic matching
- If customer has typos or uses different language, try to match to closest product
- Use the FULL product name from catalog when possible
- Match products regardless of language (customer can ask in Tamil, Hindi, English, etc.)
- CRITICAL: If orderUpdateType is specified in context, include it in extractedData.orderUpdateType field
- This ensures the database update logic uses the correct operation (add_items, remove_items, etc.)`;
  
  return `${fullBasePrompt}\n\n${personality}${intentInstructions}${multipleIntentInstructions}${productRules}`;
}

// Helper function to parse and format order items
function parseOrderItems(items: any): any[] {
  if (!items) return [];
  
  // Handle JSONB items - might be string or already parsed
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      return [];
    }
  }
  
  // Ensure items is an array
  if (!Array.isArray(items)) {
    return [];
  }
  
  return items;
}

// Helper function to format order amount
function formatAmount(amount: number): string {
  if (amount >= 100) {
    // Likely in paise, convert to rupees
    return `₹${(amount / 100).toFixed(2)}`;
  }
  return `₹${amount.toFixed(2)}`;
}

// Helper function to format order items summary
function formatItemsSummary(items: any[]): string {
  if (items.length === 0) return 'No items';
  
  return items.map((item: any) => {
    const productName = item.product || item.name || 'Unknown';
    const quantity = item.quantity || 1;
    return `${productName} x${quantity}`;
  }).join(', ');
}

function formatOrder(order: any): string {
  if (!order) return 'No current order';
  
  const orderNumber = order.orderNumber || order.id || 'N/A';
  const items = parseOrderItems(order.items);
  const totalAmount = order.totalAmount || 0;
  const status = order.status || 'unknown';
  const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '';
  const itemsSummary = formatItemsSummary(items);
  
  return `Order ${orderNumber}: ${itemsSummary} - ${formatAmount(totalAmount)} (Status: ${status}${createdAt ? `, Date: ${createdAt}` : ''})`;
}

function formatOrderHistory(orders: any[]): string {
  if (!orders || orders.length === 0) return 'No order history available';
  
  return orders
    .map((order, index) => {
      const orderNumber = order.orderNumber || order.id || `Order ${index + 1}`;
      const items = parseOrderItems(order.items);
      const totalAmount = order.totalAmount || 0;
      const status = order.status || 'unknown';
      const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '';
      const itemsSummary = formatItemsSummary(items);
      
      return `${index + 1}. Order ${orderNumber}: ${itemsSummary} - ${formatAmount(totalAmount)} (Status: ${status}${createdAt ? `, Date: ${createdAt}` : ''})`;
    })
    .join('\n');
}

function formatRelevantProducts(products: any[]): string {
  if (!products || products.length === 0) return 'No products available';
  
  // Format price correctly (convert from paise to rupees if needed)
  const formatPrice = (price: number): string => {
    if (price >= 100) {
      // Likely in paise, convert to rupees
      return `₹${(price / 100).toFixed(2)}`;
    }
    return `₹${price.toFixed(2)}`;
  };
  
  return products
    .map((p, index) => {
      const name = p.name || 'Unknown';
      const price = p.basePrice || 0;
      const unit = p.baseUnit || 'unit';
      const stock = p.inStock !== false ? 'Available' : 'Out of stock';
      const description = p.description ? ` - ${p.description}` : '';
      const keywords = p.keywords && Array.isArray(p.keywords) && p.keywords.length > 0 
        ? ` [Keywords: ${p.keywords.join(', ')}]` 
        : '';
      return `${index + 1}. ${name}${description} - ${formatPrice(price)}/${unit} (${stock})${keywords}`;
    })
    .join('\n');
}

function formatMinimalInsights(insights: any): string {
  if (!insights) return '';
  
  const parts: string[] = [];
  if (insights.customerName) parts.push(`Name: ${insights.customerName}`);
  if (insights.preferredLanguage) parts.push(`Language: ${insights.preferredLanguage}`);
  if (insights.primaryDeliveryAddress) {
    // Truncate address to first 50 chars
    const address = insights.primaryDeliveryAddress.length > 50
      ? insights.primaryDeliveryAddress.substring(0, 50) + '...'
      : insights.primaryDeliveryAddress;
    parts.push(`Address: ${address}`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'New customer';
}

/**
 * Format customer insights for prompt to prevent asking repeated information
 */
function formatCustomerInsightsForPrompt(insights: any): string {
  if (!insights) return '';
  
  const parts: string[] = [];
  
  // Customer Basic Information
  if (insights.customerName) {
    parts.push(`- Name: ${insights.customerName}`);
  }
  if (insights.alternativePhoneNumber) {
    parts.push(`- Phone: ${insights.alternativePhoneNumber}`);
  }
  if (insights.email) {
    parts.push(`- Email: ${insights.email}`);
  }
  if (insights.preferredLanguage) {
    parts.push(`- Preferred Language: ${insights.preferredLanguage}`);
  }
  
  // Delivery Information
  if (insights.primaryDeliveryAddress || insights.deliveryAddress) {
    const address = insights.primaryDeliveryAddress || insights.deliveryAddress;
    parts.push(`- Delivery Address: ${address}`);
  }
  if (insights.deliveryInstructions) {
    parts.push(`- Delivery Instructions: ${insights.deliveryInstructions}`);
  }
  
  // Preferences
  if (insights.preferences) {
    const prefs = typeof insights.preferences === 'string' 
      ? insights.preferences 
      : JSON.stringify(insights.preferences);
    parts.push(`- Preferences: ${prefs}`);
  }
  
  // Payment & Dietary
  if (insights.paymentPreferences) {
    parts.push(`- Payment Preferences: ${insights.paymentPreferences}`);
  }
  if (insights.dietaryRestrictions) {
    parts.push(`- Dietary Restrictions: ${insights.dietaryRestrictions}`);
  }
  
  // Special Requests
  if (insights.specialRequests) {
    parts.push(`- Special Requests: ${insights.specialRequests}`);
  }
  
  // Communication Style
  if (insights.communicationStyle) {
    parts.push(`- Communication Style: ${insights.communicationStyle}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : '';
}

function extractDeliveryInfo(extractedInfo: any): string {
  if (!extractedInfo) return '';
  
  const parts: string[] = [];
  if (extractedInfo.deliveryAddress) parts.push(`Address: ${extractedInfo.deliveryAddress}`);
  if (extractedInfo.deliveryTime) parts.push(`Time: ${extractedInfo.deliveryTime}`);
  if (extractedInfo.deliveryInstructions) parts.push(`Instructions: ${extractedInfo.deliveryInstructions}`);
  
  return parts.length > 0 ? parts.join(', ') : 'Delivery info mentioned';
}

function needsCustomerContext(intent: string): boolean {
  return ['order_new', 'order_update', 'greeting', 'payment_inquiry', 'delivery_inquiry', 'account_inquiry', 'repeat_order'].includes(intent);
}

