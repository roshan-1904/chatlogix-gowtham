/**
 * TypeScript interfaces for structured AI responses
 * Defines the schema for multi-event AI processing
 */

export interface AIStructuredResponse {
  customerMessage: string;           // Message to send to customer
  orderUpdateEvent?: OrderUpdateEvent;
  customerUpdateEvent?: CustomerUpdateEvent;
  productRecommendations?: ProductRecommendation[]; // Optional recommendations to include in reply or UI
  reasoning?: string;                // AI's understanding of intent
  tokensUsed?: number;                // Total tokens used for this AI response
}

export interface OrderUpdateEvent {
  action: 'create' | 'update' | 'cancel' | 'confirm' | 'none';
  items?: OrderItem[];
  deliveryAddress?: string;
  deliveryInstructions?: string;
  specialRequests?: string;
  estimatedDelivery?: string;
  customerNotes?: string;
}

export interface OrderItem {
  product: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string; // 'piece' or 'kg'
}

export interface CustomerUpdateEvent {
  shouldUpdate: boolean;
  updates: {
    // Customer Basic Information
    customerName?: string;
    alternativePhoneNumber?: string;
    email?: string;
    preferredLanguage?: string;
    
    // Customer Summary Fields
    basicDetails?: string;      // NEW facts only
    preferences?: string;        // NEW preferences only
    communicationStyle?: string; // NEW style observations only
    currentOrder?: string;       // NEW current order context only
    
    // Delivery Information
    primaryDeliveryAddress?: string; // Primary/default delivery address
    deliveryAddress?: string;    // NEW delivery address only
    deliveryInstructions?: string; // NEW delivery instructions only
    whatsappLocation?: WhatsAppLocation; // Location shared from WhatsApp
    
    // Special Information
    specialRequests?: string;    // NEW special requests only
    specialOccasions?: SpecialOccasion[]; // Special occasions (birthdays, anniversaries, etc.)
    dietaryRestrictions?: string; // Dietary restrictions, allergies
    
    // Payment & Preferences
    paymentPreferences?: string; // Preferred payment method
  };
}

export interface ProductRecommendation {
  product: string;
  reason: string;
  price?: number;
  upsell?: boolean;
  qtySuggestion?: string;
}

/**
 * Special occasion structure
 */
export interface SpecialOccasion {
  name: string;        // e.g., "Birthday", "Anniversary"
  date: string;        // ISO date string: "2024-01-15"
  occasion: string;    // Type: "Birthday", "Wedding Anniversary", "Festival", etc.
}

/**
 * WhatsApp location structure
 */
export interface WhatsAppLocation {
  latitude: number;
  longitude: number;
  address?: string;   // Formatted address
  name?: string;      // Location name (e.g., "Home", "Office")
  sharedAt?: string;  // ISO timestamp when location was shared
}

/**
 * Customer insights structure for AI context
 */
export interface CustomerInsightsContext {
  // Customer Basic Information
  customerName?: string;
  alternativePhoneNumber?: string;
  email?: string;
  preferredLanguage?: string;
  
  // Customer Summary Fields
  basicDetails: string;
  preferences: string;
  communicationStyle: string;
  currentOrder: string;
  
  // Delivery Information
  primaryDeliveryAddress?: string;
  deliveryAddress: string;
  deliveryInstructions: string;
  whatsappLocation?: WhatsAppLocation;
  
  // Special Information
  specialRequests: string;
  specialOccasions?: SpecialOccasion[];
  dietaryRestrictions?: string;
  
  // Payment & Preferences
  paymentPreferences?: string;
  
  // Metadata
  isNewCustomer: boolean;
  lastUpdated?: Date;
}

/**
 * Vendor AI configuration for structured responses
 */
export interface VendorAIConfig {
  businessName: string;
  aiBotName: string;
  aiSystemPrompt: string;
  aiProducts: string; // JSON string
  aiPersonality?: string;
  // Customizable prompt section titles and content (text/bullets under each section)
  aiContentResponsibilities?: string;
  aiContentConversationRules?: string;
  aiContentImportantInstructions?: string;
}

/**
 * Event processing context
 */
export interface EventProcessingContext {
  conversationId: string;
  vendorId: string;
  customerId: string;
  orderId?: string;
  messageId: string;
  timestamp: Date;
}

/**
 * Event processing result
 */
export interface EventProcessingResult {
  success: boolean;
  eventsProcessed: string[];
  errors?: string[];
  duration: number;
}

/**
 * AI Response validation result
 */
export interface AIResponseValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  sanitizedResponse?: AIStructuredResponse;
}
