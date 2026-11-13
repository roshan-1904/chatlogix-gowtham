import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  isValidCaseStatusTransition,
  recordStaffAuditLog,
  getShopContext,
  checkCaseTableExists,
  type StaffCase,
  type StaffCaseNote,
  type StaffCaseStatus,
} from '../services/adminSupportService.js';

export const adminSupportRouter = Router();

/**
 * GET /api/admin/support/cases
 * Query parameters: status ('open' | 'waiting' | 'resolved' | 'all'), search, limit, page
 */
adminSupportRouter.get(
  '/cases',
  asyncHandler(async (req: Request, res: Response) => {
    const statusParam = (req.query.status as string) || 'open';
    const searchParam = ((req.query.search as string) || '').trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '25', 10), 1), 100);
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);

    const tableExists = await checkCaseTableExists();

    if (!tableExists) {
      return res.json({
        supported: false,
        status: 'pending_migration',
        message: 'StaffCase and StaffAuditLog persistence requires schema migration approval (Decision 3).',
        items: [],
        count: 0,
        page,
        limit,
      });
    }

    const where: any = {};
    if (statusParam !== 'all' && ['open', 'waiting', 'resolved'].includes(statusParam)) {
      where.status = statusParam;
    }
    if (searchParam) {
      where.OR = [
        { subject: { contains: searchParam, mode: 'insensitive' } },
        { vendor: { businessName: { contains: searchParam, mode: 'insensitive' } } },
      ];
    }

    const [totalCount, dbCases] = await Promise.all([
      (prisma as any).staffCase.count({ where }),
      (prisma as any).staffCase.findMany({
        where,
        include: {
          vendor: { select: { id: true, businessName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.json({
      supported: true,
      items: dbCases.map((c: any) => ({
        id: c.id,
        vendorId: c.vendorId,
        subject: c.subject,
        status: c.status,
        conversationId: c.conversationId,
        openedBy: c.openedBy,
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        vendor: c.vendor
          ? {
              id: c.vendor.id,
              businessName: c.vendor.businessName,
            }
          : undefined,
      })),
      count: totalCount,
      page,
      limit,
    });
  })
);

/**
 * POST /api/admin/support/cases
 * Body: { vendorId: string, subject: string, conversationId?: string }
 */
adminSupportRouter.post(
  '/cases',
  asyncHandler(async (req: Request, res: Response) => {
    const { vendorId, subject, conversationId } = req.body ?? {};

    if (!vendorId || typeof vendorId !== 'string') {
      return res.status(400).json({
        error: 'invalid_vendor',
        message: 'A valid shop (vendorId) is required.',
      });
    }

    const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';
    if (trimmedSubject.length < 3 || trimmedSubject.length > 140) {
      return res.status(400).json({
        error: 'invalid_subject',
        message: 'Subject must be between 3 and 140 characters.',
      });
    }

    // 1. Verify vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, businessName: true },
    });

    if (!vendor) {
      return res.status(404).json({
        error: 'vendor_not_found',
        message: 'Specified vendor not found.',
      });
    }

    // 2. If conversationId provided, verify conversation exists and belongs to this vendor
    if (conversationId && typeof conversationId === 'string' && conversationId.trim()) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId.trim() },
        select: { id: true, vendorId: true },
      });

      if (!conv || conv.vendorId !== vendorId) {
        return res.status(400).json({
          error: 'invalid_conversation',
          message: 'That conversation is not on this shop.',
        });
      }
    }

    const tableExists = await checkCaseTableExists();
    const actorId = (req.user as any)?.id || (req.user as any)?.uid || 'admin';

    // In production without schema migration: fail closed / report pending migration
    if (!tableExists) {
      return res.status(503).json({
        error: 'pending_migration',
        message: 'StaffCase persistence requires schema migration approval (Decision 3).',
      });
    }

    const dbCase = await (prisma as any).staffCase.create({
      data: {
        vendorId,
        subject: trimmedSubject,
        status: 'open',
        conversationId: conversationId?.trim() || null,
        openedBy: actorId,
      },
      include: {
        vendor: { select: { id: true, businessName: true } },
      },
    });

    const newCase: StaffCase = {
      id: dbCase.id,
      vendorId: dbCase.vendorId,
      subject: dbCase.subject,
      status: dbCase.status,
      conversationId: dbCase.conversationId,
      openedBy: dbCase.openedBy,
      resolvedAt: dbCase.resolvedAt ? dbCase.resolvedAt.toISOString() : null,
      createdAt: dbCase.createdAt.toISOString(),
      updatedAt: dbCase.updatedAt.toISOString(),
      vendor: dbCase.vendor
        ? {
            id: dbCase.vendor.id,
            businessName: dbCase.vendor.businessName,
          }
        : {
            id: vendor.id,
            businessName: vendor.businessName,
          },
    };

    // Record audit entry (awaited as per Finding 3)
    await recordStaffAuditLog({
      actorId,
      action: 'case_opened',
      vendorId,
      summary: `Case opened for ${vendor.businessName}: ${trimmedSubject}`,
      metadata: { caseId: dbCase.id, conversationId: conversationId?.trim() || null },
    });

    return res.status(201).json(newCase);
  })
);

/**
 * GET /api/admin/support/cases/:id
 */
adminSupportRouter.get(
  '/cases/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const caseId = req.params.id;
    const tableExists = await checkCaseTableExists();

    if (!tableExists) {
      return res.status(503).json({
        error: 'pending_migration',
        message: 'StaffCase persistence requires schema migration approval (Decision 3).',
      });
    }

    const foundCase = await (prisma as any).staffCase.findUnique({
      where: { id: caseId },
      include: {
        vendor: { select: { id: true, businessName: true } },
        notes: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!foundCase) {
      return res.status(404).json({
        error: 'case_not_found',
        message: 'Support case not found.',
      });
    }

    return res.json({
      id: foundCase.id,
      vendorId: foundCase.vendorId,
      subject: foundCase.subject,
      status: foundCase.status,
      conversationId: foundCase.conversationId,
      openedBy: foundCase.openedBy,
      resolvedAt: foundCase.resolvedAt ? foundCase.resolvedAt.toISOString() : null,
      createdAt: foundCase.createdAt.toISOString(),
      updatedAt: foundCase.updatedAt.toISOString(),
      vendor: foundCase.vendor
        ? {
            id: foundCase.vendor.id,
            businessName: foundCase.vendor.businessName,
          }
        : undefined,
      notes: (foundCase.notes || []).map((n: any) => ({
        id: n.id,
        caseId: n.caseId,
        authorId: n.authorId,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  })
);

/**
 * PATCH /api/admin/support/cases/:id
 * Body: { status: 'open' | 'waiting' | 'resolved' }
 */
adminSupportRouter.patch(
  '/cases/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const caseId = req.params.id;
    const { status: targetStatus } = req.body ?? {};

    const tableExists = await checkCaseTableExists();
    if (!tableExists) {
      return res.status(503).json({
        error: 'pending_migration',
        message: 'StaffCase persistence requires schema migration approval (Decision 3).',
      });
    }

    const foundCase = await (prisma as any).staffCase.findUnique({
      where: { id: caseId },
    });

    if (!foundCase) {
      return res.status(404).json({
        error: 'case_not_found',
        message: 'Support case not found.',
      });
    }

    const currentStatus = foundCase.status;
    const newStatus = targetStatus as StaffCaseStatus;

    if (!isValidCaseStatusTransition(currentStatus, newStatus)) {
      return res.status(409).json({
        error: 'invalid_status_transition',
        message: `Cannot transition case from ${currentStatus} to ${newStatus}.`,
      });
    }

    const actorId = (req.user as any)?.id || (req.user as any)?.uid || 'admin';
    const systemNoteBody = `Status set to ${newStatus} by ${actorId}.`;

    // Note constraint: resolvedAt must be set if resolved, cleared if reopened
    const resolvedAt = newStatus === 'resolved' ? new Date() : null;

    const [updatedDbCase] = await (prisma as any).$transaction([
      (prisma as any).staffCase.update({
        where: { id: caseId },
        data: {
          status: newStatus,
          resolvedAt,
        },
        include: { vendor: { select: { id: true, businessName: true } } },
      }),
      (prisma as any).staffCaseNote.create({
        data: {
          caseId,
          authorId: 'system',
          body: systemNoteBody,
        },
      }),
    ]);

    const allNotes = await (prisma as any).staffCaseNote.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });

    // Record audit (awaited as per Finding 3)
    await recordStaffAuditLog({
      actorId,
      action: 'case_status_changed',
      vendorId: updatedDbCase.vendorId,
      summary: `Case ${caseId} status changed from ${currentStatus} to ${newStatus}`,
      metadata: { caseId, from: currentStatus, to: newStatus },
    });

    return res.json({
      id: updatedDbCase.id,
      vendorId: updatedDbCase.vendorId,
      subject: updatedDbCase.subject,
      status: updatedDbCase.status,
      conversationId: updatedDbCase.conversationId,
      openedBy: updatedDbCase.openedBy,
      resolvedAt: updatedDbCase.resolvedAt ? updatedDbCase.resolvedAt.toISOString() : null,
      createdAt: updatedDbCase.createdAt.toISOString(),
      updatedAt: updatedDbCase.updatedAt.toISOString(),
      vendor: updatedDbCase.vendor
        ? {
            id: updatedDbCase.vendor.id,
            businessName: updatedDbCase.vendor.businessName,
          }
        : undefined,
      notes: allNotes.map((n: any) => ({
        id: n.id,
        caseId: n.caseId,
        authorId: n.authorId,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  })
);

/**
 * POST /api/admin/support/cases/:id/notes
 * Body: { body: string }
 */
adminSupportRouter.post(
  '/cases/:id/notes',
  asyncHandler(async (req: Request, res: Response) => {
    const caseId = req.params.id;
    const { body } = req.body ?? {};

    const tableExists = await checkCaseTableExists();
    if (!tableExists) {
      return res.status(503).json({
        error: 'pending_migration',
        message: 'StaffCase persistence requires schema migration approval (Decision 3).',
      });
    }

    const foundCase = await (prisma as any).staffCase.findUnique({
      where: { id: caseId },
    });

    if (!foundCase) {
      return res.status(404).json({
        error: 'case_not_found',
        message: 'Support case not found.',
      });
    }

    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 2000) {
      return res.status(400).json({
        error: 'invalid_note_body',
        message: 'Note body must be between 1 and 2000 characters.',
      });
    }

    const actorId = (req.user as any)?.id || (req.user as any)?.uid || 'admin';

    const [newNote] = await (prisma as any).$transaction([
      (prisma as any).staffCaseNote.create({
        data: {
          caseId,
          authorId: actorId,
          body: trimmedBody,
        },
      }),
      (prisma as any).staffCase.update({
        where: { id: caseId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return res.status(201).json({
      id: newNote.id,
      caseId: newNote.caseId,
      authorId: newNote.authorId,
      body: newNote.body,
      createdAt: newNote.createdAt.toISOString(),
    });
  })
);

/**
 * GET /api/admin/support/conversations/:conversationId
 * Audited conversation view - fails closed if audit insertion fails.
 */
adminSupportRouter.get(
  '/conversations/:conversationId',
  asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const caseId = typeof req.query.caseId === 'string' ? req.query.caseId : null;

    // 1. Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        vendor: { select: { id: true, businessName: true } },
        customer: { select: { id: true, phone: true } },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Conversation not found.',
      });
    }

    const actorId = (req.user as any)?.id || (req.user as any)?.uid || 'admin';

    // 2. AUDIT GATE: Fail closed if audit insertion fails
    const auditSuccess = await recordStaffAuditLog({
      actorId,
      action: 'conversation_read',
      vendorId: conversation.vendorId,
      summary: `Staff viewed conversation ${conversationId} for shop ${conversation.vendor.businessName}`,
      metadata: { conversationId, caseId },
    });

    if (!auditSuccess) {
      return res.status(500).json({
        error: 'audit_failed',
        message: 'Could not record this read. The conversation was not opened.',
      });
    }

    // 3. Load messages only after successful audit record
    // Finding 10: Take newest 200 messages (desc) and reverse to display oldest to newest
    const rawMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
      take: 200,
      select: {
        id: true,
        senderType: true,
        timestamp: true,
        content: true,
        contentEn: true,
        status: true,
      },
    });

    rawMessages.reverse();

    return res.json({
      conversationId,
      vendor: {
        id: conversation.vendor.id,
        businessName: conversation.vendor.businessName,
      },
      customer: {
        id: conversation.customer?.id,
        phone: conversation.customer?.phone || '—',
      },
      auditRecorded: true,
      messages: rawMessages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        timestamp: m.timestamp.toISOString(),
        content: m.content || '',
        contentEn: m.contentEn || null,
        status: m.status,
      })),
    });
  })
);

/**
 * GET /api/admin/support/vendors/:vendorId/context
 * Context card data: wallet, markup, whatsapp, last failure, open questions
 */
adminSupportRouter.get(
  '/vendors/:vendorId/context',
  asyncHandler(async (req: Request, res: Response) => {
    const { vendorId } = req.params;

    const context = await getShopContext(vendorId);
    if (!context) {
      return res.status(404).json({
        error: 'vendor_not_found',
        message: 'Vendor not found.',
      });
    }

    return res.json(context);
  })
);
