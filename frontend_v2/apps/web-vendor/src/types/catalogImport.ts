// Shared catalog-import types — mirror backend zod schemas in
// backend/src/routes/schemas/catalogImport.ts. Keep in sync when
// backend shape changes.

export type RowBucket = 'auto_accept' | 'review' | 'needs_pricing' | 'blocked';

export interface NormalizedProductDraft {
  rowId: string;
  name: string;
  sku?: string;
  description?: string;
  basePrice: number | null;
  baseUnit: string;
  baseQuantity: number;
  isDivisible?: boolean;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  isActive: boolean;
  imageUrl?: string;
  keywords: string[];
  overrideProtected: boolean;
  sourceMeta: {
    source: 'vision' | 'csv' | 'xlsx' | 'manual';
    confidence: number;
    fieldConfidence: Record<string, number>;
    warnings: string[];
  };
}

export interface AIConfigSections {
  personality?: string;
  greetingStyle?: string;
  businessHours?: string;
  deliveryInformation?: string;
  paymentInformation?: string;
  commonFaqs?: string;
  specialInstructions?: string;
  preparationTimeMinutes?: number;
  products?: string;
  contentResponsibilities?: string;
  contentConversationRules?: string;
  contentImportantInstructions?: string;
}

export interface ImportOptions {
  currency?: string;
  languageHint?: 'ta' | 'hi' | 'en';
  allowUpdateExisting?: boolean;
  autoGenerateAIConfig?: boolean;
  category?: string;
  maxProducts?: number;
}

export interface AnalyzeRequest {
  brochureImageKeys: string[];
  tabularFileKey?: string;
  importOptions: ImportOptions;
}

export interface AnalyzeResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
}

export interface PageProgress {
  pageIndex: number;
  key: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  rowsExtracted?: number;
  error?: string;
}

/**
 * The `*Milli` amounts are what billing charges. The `*Paise` amounts are kept
 * on the wire for rows written before the millirupee cutover; they round to
 * whole paise, so do not use them for display.
 */
export interface TokenUsageSummary {
  vision?: { promptTokens: number; completionTokens: number; totalTokens: number; costPaise: number; costMilli: number };
  enrichment?: { promptTokens: number; completionTokens: number; totalTokens: number; costPaise: number; costMilli: number };
  totalPaise: number;
  totalMilli: number;
}

export interface CatalogImportJob {
  id: string;
  vendorId: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  inputManifest: unknown;
  result: {
    normalizedProducts?: NormalizedProductDraft[];
    vendorProfile?: {
      businessName: { value: string | null; confidence: number };
      category: { value: string | null; confidence: number };
      address: { value: string | null; confidence: number };
      city: { value: string | null; confidence: number };
      hours: { value: string | null; confidence: number };
      deliveryNotes: { value: string | null; confidence: number };
      languageHint: { value: string | null; confidence: number };
    };
    warnings?: string[];
    pageProgress?: PageProgress[];
    draftEdits?: NormalizedProductDraft[];
    deferred?: Array<{ row: NormalizedProductDraft; warnings: string[]; rowStatus: string }>;
    commitSummary?: { idempotencyKey: string; summary: CommitSummary };
    commitSummaryWave2?: { idempotencyKey: string; summary: CommitSummary };
    committedAt?: string;
  } | null;
  error: string | null;
  tokenUsage: TokenUsageSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommitRequest {
  jobId: string;
  approvedProducts: NormalizedProductDraft[];
  applyAIConfig?: AIConfigSections;
  idempotencyKey: string;
  dryRun?: boolean;
  wave?: 1 | 2;
}

export interface CommitSummary {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failed: Array<{ rowId: string; reason: string }>;
  deferredCount: number;
  dryRun: boolean;
  wave: 1 | 2;
  aiConfigApplied: boolean;
}

export interface UploadUrlResponse {
  jobId: string;
  s3Key: string;
  presignedUrl: string;
  expiresAt: string;
}

export interface FastPhotoResult {
  draft: NormalizedProductDraft;
  bucket: RowBucket;
  warnings: string[];
  alternates: NormalizedProductDraft[];
  costMilli: number;
}

export interface SandboxTestResult {
  response: string;
  intent: string;
  stagesExecuted: string[];
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
}

export interface JobListEntry {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deferredCount: number;
  hasWave1: boolean;
  hasWave2: boolean;
}

export type SseEventType =
  | 'page.started'
  | 'page.completed'
  | 'page.failed'
  | 'tabular.parsed'
  | 'enrichment.done'
  | 'job.snapshot'
  | 'job.complete'
  | 'job.failed';

export interface SseHandlers {
  onEvent?: (type: SseEventType, data: Record<string, unknown>) => void;
  onTerminal?: (type: 'job.complete' | 'job.failed', data: Record<string, unknown>) => void;
  onError?: (err: Error) => void;
}
