import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Attempt to load .env from current dir, then project root fallback, then backend dir
const localEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
const backendEnvPath = path.resolve(process.cwd(), 'backend', '.env');
if (existsSync(localEnvPath)) {
  loadEnv({ path: localEnvPath });
} else if (existsSync(rootEnvPath)) {
  loadEnv({ path: rootEnvPath });
} else if (existsSync(backendEnvPath)) {
  loadEnv({ path: backendEnvPath });
} else {
  loadEnv();
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('8000'),
  ENABLE_SWAGGER: z.string().optional(),

  // Database & Cache
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),

  // Queueing
  QUEUE_PROVIDER: z.enum(['sqs', 'redis']).default('sqs'),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_SQS_ENDPOINT: z.string().optional(), // for LocalStack
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SESSION_TOKEN: z.string().optional(),
  // Inbound text queue. TEXT_QUEUE_URL is canonical (matches AWS queue
  // chatlogix-text-queue-prod). INCOMING_QUEUE_URL is a deprecated alias kept
  // so existing .env files keep working — read via getTextQueueUrl().
  TEXT_QUEUE_URL: z.string().optional(),
  INCOMING_QUEUE_URL: z.string().optional(),
  RESPONSE_QUEUE_URL: z.string().min(1, 'RESPONSE_QUEUE_URL is required'),
  AUDIO_QUEUE_URL: z.string().optional(),
  IMAGE_QUEUE_URL: z.string().optional(),
  MEDIA_FETCH_QUEUE_URL: z.string().optional(),

  // WhatsApp media storage (Conversation Parity)
  WA_MEDIA_S3_BUCKET: z.string().optional(),
  WA_MEDIA_S3_REGION: z.string().optional(),
  WA_MEDIA_RETENTION_MONTHS: z.string().default('12'),
  MEDIA_FETCH_MAX_ATTEMPTS: z.string().default('5'),

  // CloudWatch metrics (Conversation Parity)
  CLOUDWATCH_METRICS_ENABLED: z.string().default('false'),
  CLOUDWATCH_NAMESPACE: z.string().default('ChatLogix/ConversationParity'),
  CLOUDWATCH_REGION: z.string().optional(),

  // WhatsApp
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  DISABLE_WEBHOOK_SIGNATURE: z.string().optional(),

  // AI
  OPENAI_API_KEY: z.string().optional(),
  VISION_EXTRACTION_MODEL: z.string().default('gpt-4.1'),

  // Catalog Import (Smart Catalog Import feature)
  CATALOG_IMPORT_S3_BUCKET: z.string().optional(),
  CATALOG_IMPORT_S3_REGION: z.string().optional(),
  CATALOG_IMPORT_DAILY_PAISE_CAP: z.string().default('5000'),
  CATALOG_IMPORT_GLOBAL_KILL: z.string().optional(),
  CATALOG_IMPORT_DISABLE_RATE_LIMIT: z.string().optional(),

  // Product Matching Configuration
  PRODUCT_MATCHING_THRESHOLD: z.string().optional(), // Default: 0.7 (70% similarity)
  PRODUCT_MATCHING_ENABLE_FUZZY: z.string().optional(), // Default: 'true'
  PRODUCT_MATCHING_MAX_CATALOG_SIZE: z.string().optional(), // Default: '1000'
  PRODUCT_MATCHING_ENABLE_AI_MULTILANG: z.string().optional(), // Default: 'true'
  PRODUCT_MATCHING_AI_FALLBACK_THRESHOLD: z.string().optional(), // Default: '0.6'

  // Billing credits per message type
  BILLING_TEXT_CREDIT: z.string().default('1'),
  BILLING_AUDIO_CREDIT: z.string().default('3'),
  BILLING_IMAGE_CREDIT: z.string().default('2'),
  BILLING_VIDEO_CREDIT: z.string().default('10'),
  BILLING_DOCUMENT_CREDIT: z.string().default('2'),
  BILLING_LOCATION_CREDIT: z.string().default('1'),
  BILLING_STICKER_CREDIT: z.string().default('0'),
  BILLING_CONTACT_CREDIT: z.string().default('1'),
  BILLING_INTERACTIVE_CREDIT: z.string().default('1'),
  BILLING_REACTION_CREDIT: z.string().default('0'),

  // Feature flags
  USE_STRUCTURED_AI_RESPONSES: z.string().optional(),
  USE_CUSTOMER_INSIGHTS: z.string().optional(),
  USE_EVENT_PROCESSING: z.string().optional(),
  ENABLE_MULTI_STAGE_AI: z.string().optional(), // 'true' | 'false' | percentage '10' | '50' | '100'
  MULTI_STAGE_AI_ROLLOUT_PERCENTAGE: z.string().optional(), // 0-100
  USE_AI_MEMORY_EXTRACTION: z.string().optional(), // 'true' | 'false', default: 'true'

  LOG_LEVEL: z.string().default('error'),
  ENABLE_FILE_LOGS: z.string().optional(),
  ENABLE_CONVERSATION_LOGS: z.string().optional(),
  ENABLE_MULTI_STAGE_LOGS: z.string().optional(), // 'true' | 'false' (default: false) — per-message stage JSON files

  // Auth & Firebase
  AUTH_JWT_SECRET: z.string().default('change-me-secret'),
  AUTH_TOKEN_EXPIRES_IN: z.string().default('1h'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH: z.string().optional(),
  FIREBASE_API_KEY: z.string().optional(),
  RECAPTCHA_SECRET_KEY: z.string().optional(),
  AUTH_ADMIN_PHONES: z.string().optional()
});

export type Env = z.infer<typeof EnvSchema> & {
  PORT: string;
};

export const env: Env = EnvSchema.parse(process.env);

// Canonical accessor for the inbound text queue. Throws if neither
// TEXT_QUEUE_URL nor INCOMING_QUEUE_URL is set — caught at first call site
// rather than at import, so workers that don't need it (e.g. response worker)
// can still boot.
export function getTextQueueUrl(): string {
  const url = env.TEXT_QUEUE_URL || env.INCOMING_QUEUE_URL;
  if (!url) {
    throw new Error(
      'TEXT_QUEUE_URL is required (or legacy INCOMING_QUEUE_URL). ' +
      'In production this should point at chatlogix-text-queue-prod.'
    );
  }
  return url;
}

export const isFirebaseAuthConfigured =
  Boolean(
    env.FIREBASE_API_KEY &&
    env.FIREBASE_PROJECT_ID &&
    env.FIREBASE_CLIENT_EMAIL &&
    (env.FIREBASE_PRIVATE_KEY || env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH)
  );

if (!isFirebaseAuthConfigured) {
  console.warn(
    'Firebase phone authentication is not fully configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
    'FIREBASE_API_KEY, and either FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_KEY_PATH to enable /auth routes.'
  );
}
console.log('Environment configuration loaded (isFirebaseAuthConfigured=%s)', isFirebaseAuthConfigured ? 'true' : 'false');

export const numericEnv = {
  textCreditsPerMessage: Number(env.BILLING_TEXT_CREDIT || '1'),
  audioCreditsPerMessage: Number(env.BILLING_AUDIO_CREDIT || '3'),
  imageCreditsPerMessage: Number(env.BILLING_IMAGE_CREDIT || '2'),
  videoCreditsPerMessage: Number(env.BILLING_VIDEO_CREDIT || '10'),
  documentCreditsPerMessage: Number(env.BILLING_DOCUMENT_CREDIT || '2'),
  locationCreditsPerMessage: Number(env.BILLING_LOCATION_CREDIT || '1'),
  stickerCreditsPerMessage: Number(env.BILLING_STICKER_CREDIT || '0'),
  contactCreditsPerMessage: Number(env.BILLING_CONTACT_CREDIT || '1'),
  interactiveCreditsPerMessage: Number(env.BILLING_INTERACTIVE_CREDIT || '1'),
  reactionCreditsPerMessage: Number(env.BILLING_REACTION_CREDIT || '0'),
  mediaFetchMaxAttempts: Number(env.MEDIA_FETCH_MAX_ATTEMPTS || '5'),
  waMediaRetentionMonths: Number(env.WA_MEDIA_RETENTION_MONTHS || '12')
};

/**
 * Product Matching Configuration
 * Performance-optimized defaults for high-throughput scenarios
 */
export const PRODUCT_MATCHING_THRESHOLD = Number.parseFloat(
  process.env.PRODUCT_MATCHING_THRESHOLD || '0.7'
); // Default: 70% similarity - optimized for accuracy vs performance

export const PRODUCT_MATCHING_ENABLE_FUZZY = 
  process.env.PRODUCT_MATCHING_ENABLE_FUZZY !== 'false'; // Default: true

export const PRODUCT_MATCHING_MAX_CATALOG_SIZE = Number.parseInt(
  process.env.PRODUCT_MATCHING_MAX_CATALOG_SIZE || '1000'
); // Default: 1000 products - prevents performance degradation

export const PRODUCT_MATCHING_ENABLE_AI_MULTILANG = 
  process.env.PRODUCT_MATCHING_ENABLE_AI_MULTILANG !== 'false'; // Default: true

export const PRODUCT_MATCHING_AI_FALLBACK_THRESHOLD = Number.parseFloat(
  process.env.PRODUCT_MATCHING_AI_FALLBACK_THRESHOLD || '0.6'
); // Use AI matching if fuzzy match < 60% similarity


