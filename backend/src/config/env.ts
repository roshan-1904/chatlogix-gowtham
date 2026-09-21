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
  TEMPLATED_REPLY_DEBOUNCE_MS: z.string().default('30000'),

  // CloudWatch metrics (Conversation Parity)
  CLOUDWATCH_METRICS_ENABLED: z.string().default('false'),
  CLOUDWATCH_NAMESPACE: z.string().default('ChatLogix/ConversationParity'),
  CLOUDWATCH_REGION: z.string().optional(),

  // Dedicated CloudWatch log group for per-vendor turn audit (PutLogEvents). Unset = Pino only (local dev).
  TURN_AUDIT_LOG_GROUP: z.string().optional(),
  TURN_AUDIT_LOG_REGION: z.string().optional(),

  // Conversation processor LLM-2 verifier (spec §17, Appendix C: "tune from logs")
  VERIFY_THRESHOLD: z.string().default('0.75'),

  // FAQ retrieval (pgvector cosine similarity against the customer's current
  // message) — tunable "from logs" the same way VERIFY_THRESHOLD is.
  FAQ_SIMILARITY_THRESHOLD: z.string().default('0.75'),
  FAQ_TOP_K: z.string().default('3'),

  // Customer Query inbox: cosine ≥ this against open rows bumps hitCount (D9).
  CUSTOMER_QUERY_DEDUP_THRESHOLD: z.string().default('0.85'),

  // WhatsApp
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  DISABLE_WEBHOOK_SIGNATURE: z.string().optional(),
  // Graph API base URLs. Defaults are the real Meta endpoints, so leaving these
  // unset is the production path. Overridden only to point the send and typing
  // calls at the load-test mock (docs/LOAD_TESTING.md §5). Both must be set
  // together — the typing indicator runs on the processor hot path, so leaving
  // it on real Meta adds a failing round trip to every message.
  WHATSAPP_GRAPH_BASE_URL: z.string().default('https://graph.facebook.com/v18.0'),
  WHATSAPP_TYPING_GRAPH_BASE_URL: z.string().default('https://graph.facebook.com/v21.0'),

  // Meta Embedded Signup + P2h connect (server secrets; app id + config id exposed via GET /me/whatsapp/config)
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional(),
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  META_EXTENDED_CREDIT_LINE_ID: z.string().optional(),
  WHATSAPP_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  /** Local/staging only: skip credit attach when credit line id is unset. Default false. */
  CHATLOGIX_SKIP_CREDIT_ATTACH: z.string().optional(),

  // AI
  OPENAI_API_KEY: z.string().optional(),
  VISION_EXTRACTION_MODEL: z.string().default('gpt-4.1'),

  // Catalog Import (Smart Catalog Import feature)
  CATALOG_IMPORT_S3_BUCKET: z.string().optional(),
  CATALOG_IMPORT_S3_REGION: z.string().optional(),
  // Fallback only — live cap is PlatformSettings.catalogImportDailyPaiseCap (milli ÷ 10).
  CATALOG_IMPORT_DAILY_MILLI_CAP: z.string().default('50000'),
  CATALOG_IMPORT_GLOBAL_KILL: z.string().optional(),
  CATALOG_IMPORT_DISABLE_RATE_LIMIT: z.string().optional(),

  CATALOG_ENHANCE_GLOBAL_KILL: z.string().optional(),
  // Fallback only — live cap is PlatformSettings.catalogEnhanceDailyPaiseCap (milli ÷ 10).
  CATALOG_ENHANCE_DAILY_MILLI_CAP: z.string().default('30000'),
  CATALOG_ENHANCE_DISABLE_RATE_LIMIT: z.string().optional(),

  // Product Matching Configuration
  PRODUCT_MATCHING_THRESHOLD: z.string().optional(), // Default: 0.7 (70% similarity)
  PRODUCT_MATCHING_ENABLE_FUZZY: z.string().optional(), // Default: 'true'
  PRODUCT_MATCHING_MAX_CATALOG_SIZE: z.string().optional(), // Default: '1000'
  PRODUCT_MATCHING_ENABLE_AI_MULTILANG: z.string().optional(), // Default: 'true'
  PRODUCT_MATCHING_AI_FALLBACK_THRESHOLD: z.string().optional(), // Default: '0.6'

  // Wallet billing fallbacks. Live knobs live in PlatformSettings (paise);
  // these env vars seed the row and are last-resort when Redis/DB are empty.
  // Convert milli → paise with ÷ 10. WALLET_PAYMENT_PROVIDER stays env-only.
  USD_TO_INR_RATE: z.string().default('83'),
  PLATFORM_FEE_PER_TURN_MILLI: z.string().default('0'),
  PLATFORM_FEE_OUTBOUND_MEDIA_MILLI: z.string().default('0'),
  // Boot-time + 24h background USD/INR refresh. Unset = production only, so a
  // local process pointed at the shared database never writes PlatformSettings
  // or FxRateHistory. Never gates the admin refresh or the EventBridge Lambda.
  FX_REFRESH_ENABLED: z.string().optional(),

  // Feature flags
  USE_STRUCTURED_AI_RESPONSES: z.string().optional(),
  USE_CUSTOMER_INSIGHTS: z.string().optional(),
  USE_EVENT_PROCESSING: z.string().optional(),
  ENABLE_MULTI_STAGE_AI: z.string().optional(), // 'true' | 'false' | percentage '10' | '50' | '100'
  MULTI_STAGE_AI_ROLLOUT_PERCENTAGE: z.string().optional(), // 0-100
  USE_AI_MEMORY_EXTRACTION: z.string().optional(), // 'true' | 'false', default: 'true'

  LOG_LEVEL: z.string().default('info'),
  ENABLE_FILE_LOGS: z.string().optional(),
  ENABLE_CONVERSATION_LOGS: z.string().optional(),
  ENABLE_MULTI_STAGE_LOGS: z.string().optional(), // 'true' | 'false' (default: false) — per-message stage JSON files

  // Auth & Firebase
  AUTH_JWT_SECRET: z.string().default('change-me-secret'),
  AUTH_ACCESS_TOKEN_EXPIRES_IN: z.string().optional(),
  AUTH_TOKEN_EXPIRES_IN: z.string().default('1h'),
  AUTH_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  AUTH_COOKIE_SECURE: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH: z.string().optional(),
  FIREBASE_API_KEY: z.string().optional(),
  RECAPTCHA_SECRET_KEY: z.string().optional(),
  AUTH_ADMIN_PHONES: z.string().optional(),
  // When Firebase is not configured, allow the local 123456 OTP. Forced off in production.
  AUTH_ALLOW_DEV_OTP: z.string().optional(),

  // Trial wallet fallbacks (millirupees; 50000 = ₹50.00). Live: trialGrantPaise / trialExpiryDays.
  TRIAL_GRANT_MILLI: z.string().default('50000'),
  TRIAL_EXPIRY_DAYS: z.string().default('30'),

  // Vendor wallet top-up. Provider stays env-only; amounts/presets/mock flag
  // are fallbacks for PlatformSettings (paise = milli ÷ 10).
  WALLET_PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  MIN_WALLET_TOPUP_MILLI: z.string().default('100000'),
  MAX_WALLET_TOPUP_MILLI: z.string().default('50000000'),
  WALLET_TOPUP_PRESETS_MILLI: z.string().default('500000,1000000,2000000,5000000'),
  MOCK_WALLET_TOPUP_ENABLED: z.string().default('true')
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

export const isFirebaseAuthConfigured = Boolean(env.FIREBASE_API_KEY);

if (!isFirebaseAuthConfigured && env.NODE_ENV === 'production') {
  console.warn(
    'FIREBASE_API_KEY is not set. Vendor phone login will return 503 in production until configured.'
  );
} else if (!isFirebaseAuthConfigured) {
  console.warn(
    'FIREBASE_API_KEY is not set. /auth/send-code will use the local DEV OTP (123456) unless AUTH_ALLOW_DEV_OTP=false.'
  );
}
console.log('Environment configuration loaded (isFirebaseAuthConfigured=%s)', isFirebaseAuthConfigured ? 'true' : 'false');

/** Infra + last-resort billing fallbacks. Live billing knobs: getPlatformSettings(). */
export const numericEnv = {
  mediaFetchMaxAttempts: Number(env.MEDIA_FETCH_MAX_ATTEMPTS || '5'),
  waMediaRetentionMonths: Number(env.WA_MEDIA_RETENTION_MONTHS || '12'),
  templatedReplyDebounceMs: Number(env.TEMPLATED_REPLY_DEBOUNCE_MS || '30000'),
  trialGrantMilli: Number(env.TRIAL_GRANT_MILLI || '50000'),
  trialExpiryDays: Number(env.TRIAL_EXPIRY_DAYS || '30'),
  platformFeePerTurnMilli: Number(env.PLATFORM_FEE_PER_TURN_MILLI || '0'),
  platformFeeOutboundMediaMilli: Number(env.PLATFORM_FEE_OUTBOUND_MEDIA_MILLI || '0')
};

function parsePresetsMilli(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** `paymentProvider` stays live from env. Amounts/presets/mock are fallbacks. */
export const walletEnv = {
  paymentProvider: env.WALLET_PAYMENT_PROVIDER,
  minTopUpMilli: Number(env.MIN_WALLET_TOPUP_MILLI || '100000'),
  maxTopUpMilli: Number(env.MAX_WALLET_TOPUP_MILLI || '50000000'),
  presetsMilli: parsePresetsMilli(env.WALLET_TOPUP_PRESETS_MILLI || '500000,1000000,2000000,5000000'),
  mockTopUpEnabled: env.MOCK_WALLET_TOPUP_ENABLED !== 'false'
};

/** Meta WhatsApp connect / Embedded Signup infrastructure (not PlatformSettings). */
export const metaConnectEnv = {
  appId: env.META_APP_ID,
  appSecret: env.META_APP_SECRET,
  embeddedSignupConfigId: env.META_EMBEDDED_SIGNUP_CONFIG_ID,
  systemUserToken: env.META_SYSTEM_USER_TOKEN,
  extendedCreditLineId: env.META_EXTENDED_CREDIT_LINE_ID,
  skipCreditAttach: env.CHATLOGIX_SKIP_CREDIT_ATTACH === 'true',
  graphBaseUrl: env.WHATSAPP_GRAPH_BASE_URL ?? 'https://graph.facebook.com/v18.0'
};

/**
 * Explicit 'true'/'false' wins; otherwise the loop runs in production only.
 * Applies to the automatic loop started in index.ts — `refreshUsdInrRate()`
 * itself stays callable, so POST /api/admin/settings/refresh-fx and the
 * EventBridge fxRateRefresh Lambda are unaffected.
 */
export function resolveFxRefreshEnabled(
  flag: string | undefined,
  nodeEnv: string
): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return nodeEnv === 'production';
}

export const isFxRefreshLoopEnabled = resolveFxRefreshEnabled(
  env.FX_REFRESH_ENABLED,
  env.NODE_ENV
);

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


