import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/authorize.js';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import {
  assertVendorApprovedForWhatsApp,
  completeWhatsAppConnect,
  getEmbeddedSignupPublicConfig,
  getWhatsAppConnectStatus,
  retryWhatsAppCreditAttach
} from '../services/whatsapp/whatsappConnectService.js';
import { WHATSAPP_CONNECT_PATHS } from '../services/whatsapp/whatsappConnectTypes.js';

export const vendorWhatsAppRouter = Router();

function requireVendorId(req: Request): string {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    throw createValidationError('Vendor context is required', 'vendorId');
  }
  return vendorId;
}

const completeConnectSchema = z.object({
  code: z.string().min(1),
  waba_id: z.string().min(1),
  phone_number_id: z.string().min(1),
  business_id: z.string().optional(),
  connectPath: z.enum(WHATSAPP_CONNECT_PATHS)
});

vendorWhatsAppRouter.get(
  '/me/whatsapp',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const status = await getWhatsAppConnectStatus(vendorId);
    res.json(status);
  })
);

vendorWhatsAppRouter.get(
  '/me/whatsapp/config',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    await assertVendorApprovedForWhatsApp(vendorId);
    res.json(getEmbeddedSignupPublicConfig());
  })
);

vendorWhatsAppRouter.post(
  '/me/whatsapp/complete-connect',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const parsed = completeConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createValidationError(
        parsed.error.errors[0]?.message ?? 'Invalid connect payload',
        'body'
      );
    }
    const result = await completeWhatsAppConnect(vendorId, {
      code: parsed.data.code,
      wabaId: parsed.data.waba_id,
      phoneNumberId: parsed.data.phone_number_id,
      businessId: parsed.data.business_id,
      connectPath: parsed.data.connectPath
    });
    res.json(result);
  })
);

vendorWhatsAppRouter.post(
  '/me/whatsapp/retry-attach',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const result = await retryWhatsAppCreditAttach(vendorId);
    res.json(result);
  })
);
