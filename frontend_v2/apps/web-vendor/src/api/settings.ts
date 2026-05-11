import { apiClient } from '../lib/api.js';
import type {
  BusinessInfo,
  BusinessInfoUpdate,
  AIConfig,
  AIConfigUpdate,
  OrderSettings,
  OrderSettingsUpdate,
  NotificationSettings,
  MatchingConfig,
  TimezoneSettings,
  PhoneVerificationSendRequest,
  PhoneVerificationSendResponse,
  PhoneVerificationConfirmRequest,
  PhoneVerificationConfirmResponse,
  EmailVerificationSendRequest,
  EmailVerificationSendResponse,
  EmailVerificationConfirmRequest,
  EmailVerificationConfirmResponse,
} from '../types/settings.js';

/**
 * Get business information
 */
export async function getBusinessInfo(vendorId: string): Promise<BusinessInfo> {
  return apiClient.get<BusinessInfo>(`/vendors/${vendorId}/business-info`);
}

/**
 * Update business information
 */
export async function updateBusinessInfo(
  vendorId: string,
  data: BusinessInfoUpdate
): Promise<BusinessInfo> {
  return apiClient.put<BusinessInfo>(`/vendors/${vendorId}/business-info`, data);
}

/**
 * Get AI configuration
 */
export async function getAIConfig(vendorId: string): Promise<AIConfig> {
  const response = await apiClient.get<any>(`/vendors/${vendorId}/ai-config`);
  // Transform response to match AIConfig interface
  return {
    aiBotName: response.ai?.botName || null,
    aiPersonality: response.ai?.personality || null,
    aiSystemPrompt: response.ai?.systemPrompt || null,
    aiProducts: response.ai?.products || null,
    aiGreeting: response.ai?.greeting || null,
    aiClosing: response.ai?.closing || null,
    aiModel: null, // Not in current response, will need to fetch separately
    aiPreparationTimeMinutes: null, // Not in current response
    aiContentResponsibilities: null,
    aiContentConversationRules: null,
    aiContentImportantInstructions: null,
    aiDeliveryInstructions: response.ai?.deliveryInstructions || null,
    aiPickupDeliveryAddress: response.ai?.pickupDeliveryAddress || null,
    aiToneExample: response.ai?.toneExample || null,
  };
}

/**
 * Update AI configuration
 */
export async function updateAIConfig(
  vendorId: string,
  data: AIConfigUpdate
): Promise<{ ok: boolean; id: string }> {
  // Transform to match backend API format
  const payload: any = {};
  if (data.aiBotName !== undefined) payload.botName = data.aiBotName;
  if (data.aiPersonality !== undefined) payload.personality = data.aiPersonality;
  if (data.aiSystemPrompt !== undefined) payload.systemPrompt = data.aiSystemPrompt;
  if (data.aiProducts !== undefined) payload.products = data.aiProducts;
  if (data.aiGreeting !== undefined) payload.greeting = data.aiGreeting;
  if (data.aiClosing !== undefined) payload.closing = data.aiClosing;
  if (data.aiPreparationTimeMinutes !== undefined) payload.preparationTimeMinutes = data.aiPreparationTimeMinutes;
  if (data.aiDeliveryInstructions !== undefined) payload.deliveryInstructions = data.aiDeliveryInstructions;
  if (data.aiPickupDeliveryAddress !== undefined) payload.pickupDeliveryAddress = data.aiPickupDeliveryAddress;
  if (data.aiToneExample !== undefined) payload.toneExample = data.aiToneExample;
  
  return apiClient.put(`/vendors/${vendorId}/ai-prompts`, payload);
}

/**
 * Get order settings
 */
export async function getOrderSettings(vendorId: string): Promise<OrderSettings> {
  return apiClient.get<OrderSettings>(`/vendors/${vendorId}/order-settings`);
}

/**
 * Update order settings
 */
export async function updateOrderSettings(
  vendorId: string,
  data: OrderSettingsUpdate
): Promise<OrderSettings> {
  return apiClient.put<OrderSettings>(`/vendors/${vendorId}/order-settings`, data);
}

/**
 * Get notification settings
 */
export async function getNotificationSettings(vendorId: string): Promise<{ vendorId: string; notificationSettings: NotificationSettings }> {
  return apiClient.get(`/vendors/${vendorId}/notification-settings`);
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(
  vendorId: string,
  data: NotificationSettings
): Promise<{ vendorId: string; notificationSettings: NotificationSettings }> {
  return apiClient.put(`/vendors/${vendorId}/notification-settings`, data);
}

/**
 * Get matching configuration
 */
export async function getMatchingConfig(vendorId: string): Promise<{ vendorId: string; matchingConfig: MatchingConfig }> {
  return apiClient.get(`/vendors/${vendorId}/matching-config`);
}

/**
 * Update matching configuration
 */
export async function updateMatchingConfig(
  vendorId: string,
  data: MatchingConfig
): Promise<{ vendorId: string; matchingConfig: MatchingConfig }> {
  return apiClient.put(`/vendors/${vendorId}/matching-config`, data);
}

/**
 * Update timezone
 */
export async function updateTimezone(
  vendorId: string,
  data: TimezoneSettings
): Promise<{ vendorId: string; timezone: string }> {
  return apiClient.put(`/vendors/${vendorId}/timezone`, data);
}

/**
 * Send phone verification code
 */
export async function sendPhoneVerification(
  vendorId: string,
  data: PhoneVerificationSendRequest
): Promise<PhoneVerificationSendResponse> {
  return apiClient.post(`/vendors/${vendorId}/verify-phone/send`, data);
}

/**
 * Confirm phone verification code
 */
export async function confirmPhoneVerification(
  vendorId: string,
  data: PhoneVerificationConfirmRequest
): Promise<PhoneVerificationConfirmResponse> {
  return apiClient.post(`/vendors/${vendorId}/verify-phone/confirm`, data);
}

/**
 * Send email verification code
 */
export async function sendEmailVerification(
  vendorId: string,
  data: EmailVerificationSendRequest
): Promise<EmailVerificationSendResponse> {
  return apiClient.post(`/vendors/${vendorId}/verify-email/send`, data);
}

/**
 * Confirm email verification code
 */
export async function confirmEmailVerification(
  vendorId: string,
  data: EmailVerificationConfirmRequest
): Promise<EmailVerificationConfirmResponse> {
  return apiClient.post(`/vendors/${vendorId}/verify-email/confirm`, data);
}

