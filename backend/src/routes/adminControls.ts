import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  evaluateComputedAlerts,
  getTrialClocks,
  listAuditLogs,
  recordInMemoryAuditLog,
} from '../services/adminControlsService.js';
import { recordStaffAuditLog } from '../services/adminSupportService.js';

export const adminControlsRouter = Router();

const ClientAuditRecordSchema = z.object({
  action: z.enum(['shop_viewed']),
  vendorId: z.string().min(1, 'vendorId is required'),
  summary: z.string().min(1).max(500).optional(),
  metadata: z
    .record(z.unknown())
    .optional()
    .refine(
      (val) => !val || JSON.stringify(val).length <= 2048,
      'Metadata payload exceeds maximum size of 2048 characters'
    ),
});

/**
 * GET /api/admin/audit
 * Query parameters: vendorId, action, search, limit, page
 */
adminControlsRouter.get(
  '/audit',
  asyncHandler(async (req: Request, res: Response) => {
    const { vendorId, action, search, limit, page } = req.query;

    const result = await listAuditLogs({
      vendorId: typeof vendorId === 'string' ? vendorId : undefined,
      action: typeof action === 'string' ? action : undefined,
      search: typeof search === 'string' ? search : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
    });

    return res.json(result);
  })
);

/**
 * POST /api/admin/audit/record
 * Allows client or staff action hooks to record an audit action (e.g. shop_viewed on look-inside)
 */
adminControlsRouter.post(
  '/audit/record',
  asyncHandler(async (req: Request, res: Response) => {
    const parseResult = ClientAuditRecordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'invalid_payload',
        message: 'Invalid audit record payload.',
        details: parseResult.error.flatten(),
      });
    }

    const { action, vendorId, summary, metadata } = parseResult.data;
    const actorId = (req.user as any)?.id || (req.user as any)?.uid || 'admin';

    // Store in-memory for immediate visibility in viewer (if pending migration)
    recordInMemoryAuditLog({
      actorId,
      action: action as any,
      vendorId: vendorId || null,
      summary: summary || `Staff inspected shop ${vendorId}`,
      metadata: metadata || null,
    });

    // Durable audit write - awaited
    await recordStaffAuditLog({
      actorId,
      action: action as any,
      vendorId: vendorId || null,
      summary: summary || `Staff inspected shop ${vendorId}`,
      metadata: metadata || null,
    });

    return res.status(201).json({ recorded: true });
  })
);

/**
 * GET /api/admin/alerts/computed
 * Evaluates rules on demand: low_wallet, failing_replies, whatsapp_dropped, fx_stale
 */
adminControlsRouter.get(
  '/alerts/computed',
  asyncHandler(async (_req: Request, res: Response) => {
    const alerts = await evaluateComputedAlerts();
    return res.json({
      alerts,
      count: alerts.length,
      evaluatedAt: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/admin/trials
 * Query parameter: filter ('next7' | 'past' | 'all')
 */
adminControlsRouter.get(
  '/trials',
  asyncHandler(async (req: Request, res: Response) => {
    const filterParam = (req.query.filter as string) || 'next7';
    const validFilter =
      filterParam === 'past' || filterParam === 'all' ? filterParam : 'next7';

    const items = await getTrialClocks(validFilter);
    return res.json({
      filter: validFilter,
      items,
      count: items.length,
    });
  })
);
