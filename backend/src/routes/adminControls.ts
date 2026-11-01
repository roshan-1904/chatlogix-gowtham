import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  evaluateComputedAlerts,
  getTrialClocks,
  listAuditLogs,
  recordInMemoryAuditLog,
} from '../services/adminControlsService.js';
import { recordStaffAuditLog } from '../services/adminSupportService.js';

export const adminControlsRouter = Router();

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
    const { action, vendorId, summary, metadata } = req.body ?? {};

    if (!action || typeof action !== 'string') {
      return res.status(400).json({
        error: 'invalid_action',
        message: 'Action string is required.',
      });
    }

    const actorId = (req.user as any)?.id || (req.user as any)?.uid || 'admin';

    // Store in-memory for immediate visibility in viewer
    recordInMemoryAuditLog({
      actorId,
      action: action as any,
      vendorId: vendorId || null,
      summary: summary || `Action ${action} performed by staff`,
      metadata: metadata || null,
    });

    // Also attempt persistent audit log (fails closed silently if not migrated)
    void recordStaffAuditLog({
      actorId,
      action: action as any,
      vendorId: vendorId || null,
      summary: summary || `Action ${action} performed by staff`,
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
