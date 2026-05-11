/**
 * TypeScript interfaces for Multi-Stage AI Processing
 * 
 * Reference:
 * - Multi-Stage AI Processing Optimization - Requirements Document
 * - Multi-Stage AI Processing - Complete Implementation Plan
 */

export interface StageExecutionResult {
  stage: string;
  success: boolean;
  output: any;
  tokensUsed?: number;
  cost?: number;
  duration: number;
  error?: string;
  errorType?: string;
  fallbackUsed?: boolean;
}

export interface MultiStageResponse {
  finalMessage: string;
  intent: string;
  extractedData: {
    orderItems?: any[];
    deliveryAddress?: string;
    deliveryInstructions?: string;
    specialRequests?: string;
    customerInfo?: any;
    orderUpdateType?: 'add_items' | 'remove_items' | 'change_quantity' | 'modify_delivery' | 'replace_order' | 'partial_update' | null;
  };
  stagesExecuted: string[];
  stagesSkipped: string[];
  totalTokensUsed: number;
  totalCost: number;
  qualityScore?: number;
  // Legacy compatibility fields
  orderUpdateEvent?: any;
  customerUpdateEvent?: any;
  productRecommendations?: any[];
  tokensUsed?: number;
}

export interface StageContext {
  conversationId: string;
  vendorId: string;
  customerId: string;
  messageId: string;
  rawMessage: string;
  normalizedMessage?: any;
  memory?: any;
  intentResult?: any;
  intentPrioritization?: any; // Intent prioritization result from Stage 1.5
  fetchedData?: any;
  aiResponse?: any;
  refinedResponse?: any;
  validationResult?: any;
  qualityAssessment?: any;
  correctionResult?: any;
  proactiveAssistance?: any; // Result from Stage 4.7 — passed to Stage 7 for optional appending
  isFirstMessage?: boolean; // Flag to indicate if this is the first customer message
  validationFailedMessage?: string; // Message to use when validation fails
  /**
   * Sink-gating flag for the catalog-import test-message / sandbox flow.
   * When true the orchestrator still runs every stage (so costs and quality
   * are measured realistically) but skips side effects that a vendor would
   * observe from a real customer message: no assistant Message persisted, no
   * SQS publish for WhatsApp delivery, no wallet deduction. Inbound-message
   * summary writes are skipped too since the inbound was synthetic.
   */
  sandbox?: boolean;
  /** Optional capture for the sandbox caller — populated at Stage 9 when sandbox=true. */
  sandboxFinalMessage?: string;
}

export interface StageConfig {
  name: string;
  enabled: boolean;
  timeout?: number;
  retries?: number;
  fallbackEnabled?: boolean;
}

export interface IntentClassification {
  primaryIntent: 'order_new' | 'order_update' | 'order_status' | 
                 'product_inquiry' | 'greeting' | 'support' | 
                 'cancel_order' | 'confirm_order' |
                 'payment_inquiry' | 'delivery_inquiry' | 'complaint' | 'refund_request' |
                 'feedback' | 'return_request' | 'account_inquiry' | 'repeat_order' |
                 'other';
  secondaryIntents?: string[];
  confidence: number;
  extractedInfo: {
    products?: string[];
    quantities?: string[];
    orderUpdateType?: 'add_items' | 'remove_items' | 'change_quantity' | 
                      'modify_delivery' | 'replace_order' | 'partial_update' | null;
    itemsToAdd?: any[];
    itemsToRemove?: string[];
    quantityChanges?: Array<{product: string, newQuantity: number}>;
    hasDeliveryInfo: boolean;
    hasSpecialRequests: boolean;
    mentionsOrder: boolean;
    orderNumber?: string | null;
    urgency: 'low' | 'medium' | 'high';
    // NEW: Additional fields for new intents
    paymentMethod?: 'cash' | 'UPI' | 'card' | 'online' | 'COD' | null;  // For payment_inquiry
    deliveryArea?: string | null;                                        // For delivery_inquiry
    deliveryTime?: string | null;                                        // For delivery_inquiry
    complaintType?: 'quality' | 'delivery' | 'service' | 'wrong_item' | 'damaged' | 'other' | null; // For complaint
    refundReason?: string | null;                                        // For refund_request
    refundAmount?: number | null;                                        // For refund_request
    feedbackType?: 'positive' | 'negative' | 'neutral' | null;         // For feedback
    feedbackRating?: number | null;                                      // For feedback (1-5 stars)
    returnReason?: string | null;                                        // For return_request
    returnItem?: string | null;                                          // For return_request
    accountField?: 'address' | 'phone' | 'email' | 'name' | 'other' | null; // For account_inquiry
    previousOrderNumber?: string | null;                                 // For repeat_order
    customerName?: string | null;                                        // For confirm_order when providing name in response to question
    deliveryAddress?: string | null;                                     // For confirm_order/order_update when providing address in response to question
  };
  needsMoreContext: boolean;
  reasoning: string;
  tokensUsed?: number;
  cost?: number;
}

export interface ConversationMemory {
  keyFacts: string[];
  ongoingTopics: string[];
  customerPreferences: Record<string, any>;
  lastOrderSummary?: string;
  conversationSummary: string;
  importantContext: string[];
  turnNumber: number;
  conversationStage: 'greeting' | 'information_gathering' | 'order_confirmation' | 'closing';
  /** Language/script of the customer's most recent message (ISO 639-1 or free-form like "ta-latin"). */
  lastCustomerLanguage?: string;
  /** Whether the system has asked the customer to confirm handoff to a human agent. */
  handoffConfirmationPending?: boolean;
}

export interface NormalizedMessage {
  original: string;
  cleaned: string;
  language: string;
  emojisInterpreted: string[];
  typosCorrected: boolean;
  abbreviationsExpanded: boolean;
  hasEmojis: boolean;
  informalPatterns: string[];
  tokensUsed?: number;
  cost?: number;
}

