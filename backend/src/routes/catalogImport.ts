import express from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { requireRole } from '../middleware/authorize.js';
import { verifyAuthToken } from '../services/tokenService.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import {
  createPresignedUploadUrl,
  ImportStorageError,
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  MAX_TABULAR_BYTES,
  TABULAR_CONTENT_TYPES
} from '../services/importStorageService.js';
import { writeLocalImport } from '../services/catalogImportLocalStore.js';
import { assertKeyBelongsToVendor, FileIntakeError } from '../services/fileIntakeService.js';
import {
  AnalyzeRequestSchema,
  CommitRequestSchema,
  DraftPatchSchema,
  FastPhotoSchema,
  FastTemplateSchema,
  TestMessageSchema
} from './schemas/catalogImport.js';
import {
  analyzeDailyRateLimit,
  analyzeHourlyRateLimit,
  enforceDailyPaiseCap,
  fastPathRateLimit
} from '../middleware/catalogImportRateLimit.js';
import { startAnalyze, commit as commitCatalog } from '../services/catalogImportService.js';
import { mergeJobResult } from '../services/catalogImportAuditService.js';
import { catalogImportEventBus } from '../services/catalogImportEventBus.js';

export const catalogImportRouter = express.Router();

// Global kill switch — lets ops disable the entire feature without touching per-vendor flags.
catalogImportRouter.use((req, res, next) => {
  if (env.CATALOG_IMPORT_GLOBAL_KILL === 'true') {
    return res.status(404).json({ error: 'not_found' });
  }
  next();
});

// Auth — accept either Authorization: Bearer header (default for fetch) or
// ?token= query param (required for EventSource on the SSE stream, which
// cannot set custom request headers). Falls through to existing requireRole
// + per-vendor enabled checks on each route.
catalogImportRouter.use((req, res, next) => {
  const headerToken = (req.get('authorization') || req.get('Authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = headerToken || queryToken;
  if (!token) {
    return res.status(401).json({ error: 'authentication_required' });
  }
  try {
    const payload = verifyAuthToken(token);
    (req as any).user = { id: payload.userId, ...payload };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
});

// Per-vendor feature-flag check. Mounts after authenticate + requireRole so req.user is populated.
async function requireCatalogImportEnabled(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    return res.status(403).json({ error: 'vendor_context_missing' });
  }
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { catalogImportEnabled: true }
  });
  if (!vendor?.catalogImportEnabled) {
    return res.status(404).json({ error: 'not_found' });
  }
  next();
}

const UploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(16 * 1024 * 1024),
  jobId: z.string().uuid().optional()
});

catalogImportRouter.post(
  '/upload-url',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const parsed = UploadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const vendorId = req.user!.vendorId!;
    const jobId = parsed.data.jobId ?? randomUUID();
    try {
      const result = await createPresignedUploadUrl({
        vendorId,
        jobId,
        filename: parsed.data.filename,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes
      });
      if (result.storage === 'local') {
        const headerToken = (req.get('authorization') || req.get('Authorization') || '')
          .replace(/^Bearer\s+/i, '')
          .trim();
        const token = headerToken || (typeof req.query.token === 'string' ? req.query.token : '');
        const origin = `${req.protocol}://${req.get('host')}`;
        result.presignedUrl = `${origin}/api/catalog-import/direct-upload?key=${encodeURIComponent(result.s3Key)}&token=${encodeURIComponent(token)}`;
      }
      return res.json({ jobId, ...result });
    } catch (err) {
      if (err instanceof ImportStorageError) {
        return res.status(err.statusCode).json({ error: err.code, message: err.message });
      }
      logger.error({ err, vendorId }, 'presigned_upload_url_failed');
      return res.status(500).json({ error: 'upload_url_failed' });
    }
  }
);

catalogImportRouter.put(
  '/direct-upload',
  express.raw({ type: '*/*', limit: '10mb' }),
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    if (env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'not_found' });
    }
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    const vendorId = req.user!.vendorId!;
    try {
      assertKeyBelongsToVendor(key, vendorId);
      const contentType = (req.get('content-type') || '').split(';')[0].trim();
      const isImage = IMAGE_CONTENT_TYPES.has(contentType);
      const isTabular = TABULAR_CONTENT_TYPES.has(contentType);
      if (!isImage && !isTabular) {
        return res.status(415).json({
          error: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Content type ${contentType} is not allowed`
        });
      }
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? []);
      const cap = isImage ? MAX_IMAGE_BYTES : MAX_TABULAR_BYTES;
      if (body.length <= 0 || body.length > cap) {
        return res.status(413).json({
          error: 'PAYLOAD_TOO_LARGE',
          message: `File size exceeds ${cap} bytes`
        });
      }
      await writeLocalImport(key, body, contentType);
      return res.status(200).end();
    } catch (err) {
      if (err instanceof ImportStorageError || err instanceof FileIntakeError) {
        return res.status(err.statusCode).json({ error: err.code, message: err.message });
      }
      logger.error({ err, vendorId }, 'catalog_import_direct_upload_failed');
      return res.status(500).json({ error: 'upload_failed' });
    }
  }
);

catalogImportRouter.post(
  '/analyze',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  analyzeDailyRateLimit,
  analyzeHourlyRateLimit,
  enforceDailyPaiseCap,
  async (req, res) => {
    const parsed = AnalyzeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const vendorId = req.user!.vendorId!;
    try {
      const start = await startAnalyze(vendorId, parsed.data);
      return res.status(202).json(start);
    } catch (err) {
      logger.error({ err, vendorId }, 'catalog_import_analyze_failed');
      return res.status(500).json({ error: 'analyze_failed' });
    }
  }
);

// GET /jobs?status=has_deferred — powers the Products page Wave-2 banner.
// MUST stay above GET /:jobId or Express will route it to the param handler.
catalogImportRouter.get(
  '/jobs',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const vendorId = req.user!.vendorId!;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const jobs = await prisma.catalogImportJob.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        result: true
      }
    });
    const filtered = jobs.filter((job) => {
      if (status !== 'has_deferred') return true;
      const r = job.result as { deferred?: unknown[] } | null;
      return Array.isArray(r?.deferred) && r!.deferred!.length > 0;
    });
    const shaped = filtered.map((job) => {
      const r = job.result as {
        deferred?: unknown[];
        commitSummary?: unknown;
        commitSummaryWave2?: unknown;
      } | null;
      return {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        deferredCount: Array.isArray(r?.deferred) ? r!.deferred!.length : 0,
        hasWave1: !!r?.commitSummary,
        hasWave2: !!r?.commitSummaryWave2
      };
    });
    return res.json({ jobs: shaped });
  }
);

catalogImportRouter.get(
  '/:jobId',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const vendorId = req.user!.vendorId!;
    const job = await prisma.catalogImportJob.findUnique({ where: { id: req.params.jobId } });
    if (!job || job.vendorId !== vendorId) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json(job);
  }
);

catalogImportRouter.get(
  '/:jobId/stream',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const vendorId = req.user!.vendorId!;
    const jobId = req.params.jobId;
    const job = await prisma.catalogImportJob.findUnique({ where: { id: jobId } });
    if (!job || job.vendorId !== vendorId) {
      return res.status(404).json({ error: 'not_found' });
    }

    // Headers — X-Accel-Buffering: no required to bypass nginx buffering.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send a snapshot immediately so reconnecting clients don't have to poll
    // the /:jobId endpoint separately.
    res.write(
      `event: job.snapshot\ndata: ${JSON.stringify({
        status: job.status,
        result: job.result ?? null
      })}\n\n`
    );

    // Resume from last-seen id when provided.
    const lastIdHeader = req.header('Last-Event-ID');
    const lastEventId = lastIdHeader ? Number(lastIdHeader) : undefined;
    const unsubscribe = catalogImportEventBus.subscribe(
      jobId,
      res,
      Number.isFinite(lastEventId as number) ? (lastEventId as number) : undefined
    );

    // 15s heartbeat keeps nginx / load balancers from killing the connection.
    const heartbeat = setInterval(() => {
      try { res.write(`: hb ${Date.now()}\n\n`); } catch {}
    }, 15_000);

    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      try { res.end(); } catch {}
    };
    req.on('close', close);
    req.on('aborted', close);

    // If the job already reached a terminal state, emit the terminal event
    // immediately so freshly-connecting clients get it without waiting.
    if (job.status === 'ready' || job.status === 'failed') {
      const terminalType = job.status === 'ready' ? 'job.complete' : 'job.failed';
      res.write(
        `event: ${terminalType}\ndata: ${JSON.stringify({ replayed: true })}\n\n`
      );
      setTimeout(close, 50);
    }
  }
);

catalogImportRouter.patch(
  '/:jobId/draft',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const parsed = DraftPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const vendorId = req.user!.vendorId!;
    const job = await prisma.catalogImportJob.findUnique({ where: { id: req.params.jobId } });
    if (!job || job.vendorId !== vendorId) {
      return res.status(404).json({ error: 'not_found' });
    }
    await mergeJobResult(req.params.jobId, { draftEdits: parsed.data.draftEdits });
    return res.json({ ok: true });
  }
);

catalogImportRouter.post(
  '/commit',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const parsed = CommitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const vendorId = req.user!.vendorId!;
    // Ownership check before commit touches the job.
    const job = await prisma.catalogImportJob.findUnique({ where: { id: parsed.data.jobId } });
    if (!job || job.vendorId !== vendorId) {
      return res.status(404).json({ error: 'not_found' });
    }
    // Idempotency key must be exactly `${vendor}:${job}` for wave-1, or the
    // server-issued retry form `${vendor}:${job}:retry:<uuid>`. Reject
    // wave-2 keys outright so a buggy client can't poison the wave-1 cache
    // slot.
    const base = `${vendorId}:${parsed.data.jobId}`;
    const key = parsed.data.idempotencyKey;
    const isExact = key === base;
    const isRetry = key.startsWith(`${base}:retry:`);
    if (!isExact && !isRetry) {
      return res.status(400).json({ error: 'idempotency_key_mismatch' });
    }
    try {
      const { summary, replayed } = await commitCatalog(vendorId, parsed.data);
      if (replayed) res.setHeader('Idempotent-Replay', 'true');
      return res.json(summary);
    } catch (err) {
      logger.error({ err, vendorId, jobId: parsed.data.jobId }, 'catalog_import_commit_failed');
      return res.status(500).json({ error: 'commit_failed' });
    }
  }
);

// Wave-2 commit — pulls the deferred rows and feeds them back through commit.
// Caller still supplies the final approved rows so they can fix prices first.
catalogImportRouter.post(
  '/:jobId/commit-wave2',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const parsed = CommitRequestSchema.safeParse({
      ...req.body,
      jobId: req.params.jobId,
      wave: 2
    });
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const vendorId = req.user!.vendorId!;
    const job = await prisma.catalogImportJob.findUnique({ where: { id: parsed.data.jobId } });
    if (!job || job.vendorId !== vendorId) {
      return res.status(404).json({ error: 'not_found' });
    }
    const expectedPrefix = `${vendorId}:${parsed.data.jobId}:wave2`;
    if (!parsed.data.idempotencyKey.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: 'idempotency_key_mismatch' });
    }
    try {
      const { summary, replayed } = await commitCatalog(vendorId, parsed.data);
      if (replayed) res.setHeader('Idempotent-Replay', 'true');
      return res.json(summary);
    } catch (err) {
      logger.error({ err, vendorId, jobId: parsed.data.jobId }, 'catalog_import_commit_wave2_failed');
      return res.status(500).json({ error: 'commit_failed' });
    }
  }
);

// Retry only the rows that previously failed in the wave-1 commit.
catalogImportRouter.post(
  '/:jobId/retry-failed',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const vendorId = req.user!.vendorId!;
    const job = await prisma.catalogImportJob.findUnique({ where: { id: req.params.jobId } });
    if (!job || job.vendorId !== vendorId) {
      return res.status(404).json({ error: 'not_found' });
    }
    const result = job.result as {
      commitSummary?: { summary?: { failed?: Array<{ rowId: string }> } };
      normalizedProducts?: Array<{ rowId: string }>;
      draftEdits?: Array<{ rowId: string }>;
    } | null;
    const failedIds = new Set((result?.commitSummary?.summary?.failed ?? []).map((f) => f.rowId));
    if (failedIds.size === 0) {
      return res.json({
        createdCount: 0, updatedCount: 0, skippedCount: 0,
        failed: [], deferredCount: 0, dryRun: false, wave: 1, aiConfigApplied: false
      });
    }
    const byId = new Map<string, any>();
    for (const p of result?.normalizedProducts ?? []) byId.set(p.rowId, p);
    for (const p of result?.draftEdits ?? []) byId.set(p.rowId, p);
    const retryRows = Array.from(failedIds)
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (retryRows.length === 0) {
      return res.status(400).json({ error: 'no_retry_rows_found' });
    }

    // Salt the retry key with a fresh UUID so we don't collide with the
    // original wave-1 commit's cached summary (which still contains the
    // previously-failed rows). Each retry is a distinct commit.
    const retryKey = `${vendorId}:${req.params.jobId}:retry:${randomUUID()}`;
    try {
      const parsed = CommitRequestSchema.safeParse({
        jobId: req.params.jobId,
        approvedProducts: retryRows,
        idempotencyKey: retryKey,
        wave: 1,
        dryRun: false
      });
      if (!parsed.success) {
        return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
      }
      const { summary } = await commitCatalog(vendorId, parsed.data);
      return res.json(summary);
    } catch (err) {
      logger.error({ err, vendorId, jobId: req.params.jobId }, 'catalog_import_retry_failed_failed');
      return res.status(500).json({ error: 'retry_failed' });
    }
  }
);

catalogImportRouter.post(
  '/fast/photo',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  fastPathRateLimit,
  // Vision is the costly call here — the daily paise cap must apply.
  enforceDailyPaiseCap,
  async (req, res) => {
    const parsed = FastPhotoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const vendorId = req.user!.vendorId!;
    try {
      const { assertKeyBelongsToVendor: assertKey } = await import('../services/fileIntakeService.js');
      assertKey(parsed.data.imageKey, vendorId);
      const { fastPhoto } = await import('../services/catalogImportFastPathService.js');
      const draft = await fastPhoto(vendorId, parsed.data.imageKey);
      return res.json(draft);
    } catch (err) {
      logger.error({ err, vendorId }, 'fast_photo_failed');
      return res.status(500).json({ error: 'fast_photo_failed' });
    }
  }
);

catalogImportRouter.post(
  '/fast/template',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  fastPathRateLimit,
  async (req, res) => {
    const parsed = FastTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    try {
      const { getTemplate } = await import('../services/catalogTemplateService.js');
      const products = await getTemplate(parsed.data.category);
      return res.json({ category: parsed.data.category, products });
    } catch (err) {
      logger.error({ err, category: parsed.data.category }, 'fast_template_failed');
      return res.status(500).json({ error: 'fast_template_failed' });
    }
  }
);

catalogImportRouter.get(
  '/template/:category/available',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  async (req, res) => {
    const { getTemplate } = await import('../services/catalogTemplateService.js');
    const products = await getTemplate(req.params.category);
    return res.json({ category: req.params.category, available: products.length > 0 });
  }
);

catalogImportRouter.post(
  '/test-message',
  requireRole('vendor', 'admin'),
  requireCatalogImportEnabled,
  fastPathRateLimit,
  async (req, res) => {
    const parsed = TestMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const vendorId = req.user!.vendorId!;
    try {
      const { runSandboxTest } = await import('../services/catalogImportSandboxService.js');
      const out = await runSandboxTest(vendorId, parsed.data.text);
      return res.json(out);
    } catch (err) {
      logger.error({ err, vendorId }, 'test_message_failed');
      return res.status(500).json({ error: 'test_message_failed' });
    }
  }
);
