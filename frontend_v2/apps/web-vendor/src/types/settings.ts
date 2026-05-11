/**
 * Type definitions for Vendor Settings
 */

export interface BusinessInfo {
  id: string;
  businessName: string;
  phone: string;
  email: string;
  category: string | null;
  updatedAt: string;
}

export interface BusinessInfoUpdate {
  businessName: string;
  phone: string;
  email: string;
  category?: string | null;
}

export interface AIConfig {
  aiBotName: string | null;
  aiPersonality: string | null;
  aiSystemPrompt: string | null;
  aiProducts: string | null;
  aiGreeting: string | null;
  aiClosing: string | null;
  aiModel: string | null;
  aiPreparationTimeMinutes: number | null;
  aiContentResponsibilities: string | null;
  aiContentConversationRules: string | null;
  aiContentImportantInstructions: string | null;
  aiDeliveryInstructions: string | null;
  aiPickupDeliveryAddress: string | null;
  aiToneExample: string | null;
}

export interface AIConfigUpdate {
  aiBotName?: string | null;
  aiPersonality?: string | null;
  aiSystemPrompt?: string | null;
  aiProducts?: string | null;
  aiGreeting?: string | null;
  aiClosing?: string | null;
  aiModel?: string | null;
  aiPreparationTimeMinutes?: number | null;
  aiContentResponsibilities?: string | null;
  aiContentConversationRules?: string | null;
  aiContentImportantInstructions?: string | null;
  aiDeliveryInstructions?: string | null;
  aiPickupDeliveryAddress?: string | null;
  aiToneExample?: string | null;
}

export interface OrderSettings {
  category: string | null;
  askForPreferredDeliveryDate: boolean;
  orderPreparationConfig: any | null;
  orderPrefix: string | null;
  minimumOrderValue: number | null;
  aiPreparationTimeMinutes?: number | null; // Backward compatibility
}

export interface OrderSettingsUpdate {
  category?: string | null;
  askForPreferredDeliveryDate?: boolean;
  orderPreparationConfig?: any | null;
  orderPrefix?: string | null;
  minimumOrderValue?: number | null;
}

export interface NotificationSettings {
  orderUpdates?: boolean;
  paymentLinks?: boolean;
  shippingUpdates?: boolean;
  enabledStatuses?: Array<'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'>;
  quietHours?: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string; // HH:MM format
  };
  [key: string]: any; // Allow additional fields
}

export interface MatchingConfig {
  threshold?: number;
  enableFuzzy?: boolean;
  enableAIMatching?: boolean;
  productNameField?: string;
  productKeywordsField?: string;
  productPriceField?: string;
  supportedLanguages?: string[];
  aiMatchingModel?: string;
  [key: string]: any; // Allow additional fields
}

export interface TimezoneSettings {
  timezone: string;
}

export interface PhoneVerificationSendRequest {
  newPhoneNumber: string;
}

export interface PhoneVerificationSendResponse {
  sessionInfo: string;
  expiresIn: number;
}

export interface PhoneVerificationConfirmRequest {
  sessionInfo: string;
  code: string;
}

export interface PhoneVerificationConfirmResponse {
  success: boolean;
}

export interface EmailVerificationSendRequest {
  newEmail: string;
}

export interface EmailVerificationSendResponse {
  sessionInfo: string;
  expiresIn: number;
}

export interface EmailVerificationConfirmRequest {
  sessionInfo: string;
  code: string;
}

export interface EmailVerificationConfirmResponse {
  success: boolean;
}

