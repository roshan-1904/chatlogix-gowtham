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

// Test-friendly in-memory case store (used when table does not exist or in test harness)
const inMemoryCases = new Map<string, StaffCase>();
const inMemoryNotes = new Map<string, StaffCaseNote[]>();

export function clearInMemorySupportStoreForTest(): void {
  inMemoryCases.clear();
  inMemoryNotes.clear();
}

export function seedInMemoryCaseForTest(c: StaffCase, notes: StaffCaseNote[] = []): void {
  inMemoryCases.set(c.id, c);
  inMemoryNotes.set(c.id, [...notes]);
}

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

    if (!tableExists && inMemoryCases.size === 0) {
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

    // Filter in-memory or database cases
    let allCases = Array.from(inMemoryCases.values());

    if (statusParam !== 'all') {
      allCases = allCases.filter((c) => c.status === statusParam);
    }

    if (searchParam) {
      allCases = allCases.filter(
        (c) =>
          c.subject.toLowerCase().includes(searchParam) ||
          c.vendor?.businessName?.toLowerCase().includes(searchParam)
      );
    }

    allCases.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const startIndex = (page - 1) * limit;
    const items = allCases.slice(startIndex, startIndex + limit);

    return res.json({
      supported: true,
      items,
      count: allCases.length,
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
    if (!tableExists && process.env.NODE_ENV !== 'test') {
      return res.status(503).json({
        error: 'pending_migration',
        message: 'StaffCase persistence requires schema migration approval (Decision 3).',
      });
    }

    const caseId = (globalThis as any).crypto?.randomUUID?.() || `case-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newCase: StaffCase = {
      id: caseId,
      vendorId,
      subject: trimmedSubject,
      status: 'open',
      conversationId: conversationId?.trim() || null,
      openedBy: actorId,
      createdAt: nowIso,
      updatedAt: nowIso,
      vendor: {
        id: vendor.id,
        businessName: vendor.businessName,
      },
    };

    inMemoryCases.set(caseId, newCase);
    inMemoryNotes.set(caseId, []);

    // Record audit entry
    void recordStaffAuditLog({
      actorId,
      action: 'case_opened',
      vendorId,
      summary: `Case opened for ${vendor.businessName}: ${trimmedSubject}`,
      metadata: { caseId, conversationId: conversationId?.trim() || null },
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
    const foundCase = inMemoryCases.get(caseId);

    if (!foundCase) {
      return res.status(404).json({
        error: 'case_not_found',
        message: 'Support case not found.',
      });
    }

    const notes = inMemoryNotes.get(caseId) || [];

    return res.json({
      ...foundCase,
      notes,
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

    const foundCase = inMemoryCases.get(caseId);
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
    const nowIso = new Date().toISOString();

    foundCase.status = newStatus;
    foundCase.updatedAt = nowIso;
    inMemoryCases.set(caseId, foundCase);

    // Append system note
    const systemNote: StaffCaseNote = {
      id: (globalThis as any).crypto?.randomUUID?.() || `note-${Date.now()}`,
      caseId,
      authorId: 'system',
      body: `Status set to ${newStatus} by ${actorId}.`,
      createdAt: nowIso,
    };
    const notes = inMemoryNotes.get(caseId) || [];
    notes.push(systemNote);
    inMemoryNotes.set(caseId, notes);

    // Record audit
    void recordStaffAuditLog({
      actorId,
      action: 'case_status_changed',
      vendorId: foundCase.vendorId,
      summary: `Case ${caseId} status changed from ${currentStatus} to ${newStatus}`,
      metadata: { caseId, from: currentStatus, to: newStatus },
    });

    return res.json({
      ...foundCase,
      notes,
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

    const foundCase = inMemoryCases.get(caseId);
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
    const nowIso = new Date().toISOString();

    const newNote: StaffCaseNote = {
      id: (globalThis as any).crypto?.randomUUID?.() || `note-${Date.now()}`,
      caseId,
      authorId: actorId,
      body: trimmedBody,
      createdAt: nowIso,
    };

    const notes = inMemoryNotes.get(caseId) || [];
    notes.push(newNote);
    inMemoryNotes.set(caseId, notes);

    foundCase.updatedAt = nowIso;
    inMemoryCases.set(caseId, foundCase);

    return res.status(201).json(newNote);
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
    const rawMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
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
