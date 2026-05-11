import { z } from 'zod';

// Phone number validation (E.164 format)
const phoneRegex = /^\+[1-9]\d{6,14}$/;

// Email validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Business Info Schema
 * Validates business name, phone, email, and category
 */
export const businessInfoSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(255, 'Business name must be less than 255 characters'),
  phone: z.string().regex(phoneRegex, 'Phone number must be in E.164 format (+123456789)'),
  email: z.string().regex(emailRegex, 'Invalid email format'),
  category: z.string().max(100, 'Category must be less than 100 characters').optional(),
});

export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;

/**
 * AI Configuration Schema
 * Validates all AI-related settings
 */
export const aiConfigSchema = z.object({
  aiBotName: z.string().max(100, 'Bot name must be less than 100 characters').optional(),
  aiPersonality: z.string().max(500, 'Personality must be less than 500 characters').optional(),
  aiSystemPrompt: z.string().max(10000, 'System prompt must be less than 10000 characters').optional(),
  aiProducts: z.string().max(10000, 'Products description must be less than 10000 characters').optional(),
  aiGreeting: z.string().max(1000, 'Greeting must be less than 1000 characters').optional(),
  aiClosing: z.string().max(1000, 'Closing must be less than 1000 characters').optional(),
  aiModel: z.string().max(50, 'Model name must be less than 50 characters').optional(),
  aiPreparationTimeMinutes: z.number().int().min(0, 'Preparation time must be non-negative').max(1440, 'Preparation time must be less than 24 hours').optional(),
  aiContentResponsibilities: z.string().max(5000, 'Responsibilities must be less than 5000 characters').optional(),
  aiContentConversationRules: z.string().max(5000, 'Conversation rules must be less than 5000 characters').optional(),
  aiContentImportantInstructions: z.string().max(5000, 'Important instructions must be less than 5000 characters').optional(),
  aiDeliveryInstructions: z.string().max(5000, 'Delivery instructions must be less than 5000 characters').optional(),
  aiPickupDeliveryAddress: z.string().max(1000, 'Pickup/Delivery address must be less than 1000 characters').optional(),
  aiToneExample: z.string().max(2000, 'Tone example must be less than 2000 characters').optional(),
});

export type AIConfigInput = z.infer<typeof aiConfigSchema>;

/**
 * Order Settings Schema
 * Validates order prefix, minimum order value, and preparation config
 */
export const orderSettingsSchema = z.object({
  category: z.string().max(100, 'Category must be less than 100 characters').optional().nullable(),
  orderPrefix: z.string()
    .max(5, 'Order prefix must be 5 characters or less')
    .regex(/^[A-Z0-9]*$/, 'Order prefix must contain only uppercase letters and numbers')
    .optional(),
  minimumOrderValue: z.number().int().min(0, 'Minimum order value must be non-negative').optional().nullable(),
  orderPreparationConfig: z.record(z.any()).optional().nullable(),
  askForPreferredDeliveryDate: z.boolean().optional(),
});

export type OrderSettingsInput = z.infer<typeof orderSettingsSchema>;

/**
 * Notification Settings Schema
 * Validates notification preferences and quiet hours
 */
export const notificationSettingsSchema = z.object({
  orderUpdates: z.boolean().optional(),
  paymentLinks: z.boolean().optional(),
  shippingUpdates: z.boolean().optional(),
  enabledStatuses: z.array(z.enum(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'])).optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format'),
    end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format'),
  }).optional(),
}).passthrough(); // Allow additional fields for flexibility

export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

/**
 * Matching Config Schema
 * Validates product matching configuration
 */
export const matchingConfigSchema = z.object({
  threshold: z.number().min(0).max(1, 'Threshold must be between 0 and 1').optional(),
  enableFuzzy: z.boolean().optional(),
  enableAIMatching: z.boolean().optional(),
  productNameField: z.string().max(50).optional(),
  productKeywordsField: z.string().max(50).optional(),
  productPriceField: z.string().max(50).optional(),
  supportedLanguages: z.array(z.string().length(2)).optional(),
  aiMatchingModel: z.string().max(50).optional(),
}).passthrough(); // Allow additional fields for flexibility

export type MatchingConfigInput = z.infer<typeof matchingConfigSchema>;

/**
 * Timezone Schema
 * Validates timezone string
 */
export const timezoneSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required').max(100, 'Timezone must be less than 100 characters'),
});

export type TimezoneInput = z.infer<typeof timezoneSchema>;

/**
 * Phone Verification Request Schema
 */
export const phoneVerificationSendSchema = z.object({
  newPhoneNumber: z.string().regex(phoneRegex, 'Phone number must be in E.164 format (+123456789)'),
});

export type PhoneVerificationSendInput = z.infer<typeof phoneVerificationSendSchema>;

/**
 * Phone Verification Confirm Schema
 */
export const phoneVerificationConfirmSchema = z.object({
  sessionInfo: z.string().min(1, 'Session info is required'),
  code: z.string().min(4, 'Verification code must be at least 4 characters').max(10, 'Verification code must be less than 10 characters'),
});

export type PhoneVerificationConfirmInput = z.infer<typeof phoneVerificationConfirmSchema>;

/**
 * Email Verification Request Schema
 */
export const emailVerificationSendSchema = z.object({
  newEmail: z.string().regex(emailRegex, 'Invalid email format'),
});

export type EmailVerificationSendInput = z.infer<typeof emailVerificationSendSchema>;

/**
 * Email Verification Confirm Schema
 */
export const emailVerificationConfirmSchema = z.object({
  sessionInfo: z.string().min(1, 'Session info is required'),
  code: z.string().min(4, 'Verification code must be at least 4 characters').max(10, 'Verification code must be less than 10 characters'),
});

export type EmailVerificationConfirmInput = z.infer<typeof emailVerificationConfirmSchema>;

