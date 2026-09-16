import express from 'express';
import { env } from '../config/env.js';
import { requireRole } from '../middleware/authorize.js';
import { requireCatalogImportEnabled } from '../middleware/requireCatalogImportEnabled.js';
import {
  enhanceHourlyRateLimit,
  enforceEnhanceDailyMilliCap
} from '../middleware/catalogEnhanceRateLimit.js';
import {
  AcceptEnhanceSchema,
  PostEnhanceMessageSchema,
  StartEnhanceSessionSchema
} from './schemas/catalogEnhance.js';
import {
  acceptEnhancePreview,
  discardEnhanceSession,
  EntityNotFoundError,
  EnhanceSessionUnavailableError,
  InsufficientBalanceError,
  postEnhanceMessage,
  postEnhanceVoice,
  startEnhanceSession
} from '../services/catalogEnhanceChatService.js';
import type { EnhanceSession } from '../services/catalogEnhanceSessionService.js';

export const catalogEnhanceRouter = express.Router();

catalogEnhanceRouter.use((req, res, next) => {
  if (env.CATALOG_ENHANCE_GLOBAL_KILL === 'true') {
    return res.status(404).json({ error: 'not_found' });
  }
  next();
});

catalogEnhanceRouter.use(requireRole('vendor', 'admin'));
catalogEnhanceRouter.use(requireCatalogImportEnabled);
catalogEnhanceRouter.use(enhanceHourlyRateLimit);
catalogEnhanceRouter.use(enforceEnhanceDailyMilliCap);

function sessionPayload(
  session: EnhanceSession,
  extra: { resumed: boolean; sufficient: boolean }
) {
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    resumed: extra.resumed,
    sufficient: extra.sufficient,
    messages: session.messages,
    preview: session.preview
  };
}

function handleEnhanceError(err: unknown, res: express.Response): boolean {
  if (err instanceof InsufficientBalanceError) {
    res.status(402).json({ error: 'insufficient_balance' });
    return true;
  }
  if (err instanceof EntityNotFoundError) {
    res.status(404).json({ error: 'not_found' });
    return true;
  }
  if (err instanceof EnhanceSessionUnavailableError) {
    res.status(503).json({ error: 'session_store_unavailable' });
    return true;
  }
  if (err instanceof Error && err.message === 'no_preview') {
    res.status(400).json({ error: 'no_preview' });
    return true;
  }
  return false;
}

catalogEnhanceRouter.post('/sessions', async (req, res) => {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    return res.status(403).json({ error: 'vendor_context_missing' });
  }
  const parsed = StartEnhanceSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  }
  try {
    const result = await startEnhanceSession(
      vendorId,
      parsed.data.entityType,
      parsed.data.entityId
    );
    return res.json(sessionPayload(result.session, result));
  } catch (err) {
    if (handleEnhanceError(err, res)) return;
    throw err;
  }
});

catalogEnhanceRouter.post('/sessions/:sessionId/messages', async (req, res) => {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    return res.status(403).json({ error: 'vendor_context_missing' });
  }
  const parsed = PostEnhanceMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  }
  try {
    const session = await postEnhanceMessage(vendorId, req.params.sessionId, parsed.data.content);
    return res.json({
      messages: session.messages,
      preview: session.preview,
      assistantMessage: session.messages[session.messages.length - 1]?.content ?? ''
    });
  } catch (err) {
    if (handleEnhanceError(err, res)) return;
    throw err;
  }
});

catalogEnhanceRouter.post(
  '/sessions/:sessionId/voice',
  express.raw({ type: ['audio/*', 'application/octet-stream', 'video/webm'], limit: '5mb' }),
  async (req, res) => {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(403).json({ error: 'vendor_context_missing' });
    }
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!buffer.length) {
      return res.status(400).json({ error: 'invalid_input', message: 'Empty audio body' });
    }
    const mimeType = req.get('content-type')?.split(';')[0]?.trim() || 'audio/webm';
    try {
      const session = await postEnhanceVoice(vendorId, req.params.sessionId, buffer, mimeType);
      const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
      return res.json({
        transcript: lastUser?.content ?? '',
        messages: session.messages,
        preview: session.preview,
        assistantMessage: session.messages[session.messages.length - 1]?.content ?? ''
      });
    } catch (err) {
      if (handleEnhanceError(err, res)) return;
      if (err instanceof Error && err.message.includes("couldn't make out")) {
        return res.status(422).json({ error: 'transcription_failed', message: err.message });
      }
      throw err;
    }
  }
);

catalogEnhanceRouter.post('/sessions/:sessionId/accept', async (req, res) => {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    return res.status(403).json({ error: 'vendor_context_missing' });
  }
  const parsed = AcceptEnhanceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  }
  try {
    const result = await acceptEnhancePreview(vendorId, req.params.sessionId, parsed.data);
    return res.json(result);
  } catch (err) {
    if (handleEnhanceError(err, res)) return;
    throw err;
  }
});

catalogEnhanceRouter.delete('/sessions/:sessionId', async (req, res) => {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    return res.status(403).json({ error: 'vendor_context_missing' });
  }
  try {
    await discardEnhanceSession(vendorId, req.params.sessionId);
    return res.status(204).send();
  } catch (err) {
    if (handleEnhanceError(err, res)) return;
    throw err;
  }
});
