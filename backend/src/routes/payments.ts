/**
 * Payment link status and related read APIs.
 */

import express from 'express';
import { prisma } from '../db/prisma.js';
import { getPaymentLinkService } from '../services/paymentLinkService.js';
import { createShopFundingCheckoutIntent } from '../services/payments/shopFundingService.js';
import { CustomError, ErrorType, ErrorSeverity, asyncHandler } from '../middleware/errorHandler.js';
import { requireRole } from '../middleware/authorize.js';

export const paymentsRouter = express.Router();

function ensureVendorAccess(req: express.Request, vendorId: string): void {
  const user = req.user;
  if (!user) {
    throw new CustomError('Authentication required', 401, ErrorType.AUTHENTICATION, ErrorSeverity.MEDIUM);
  }
  if (user.roles.includes('admin')) return;
  if (user.roles.includes('vendor') && user.vendorId === vendorId) return;
  throw new CustomError('Forbidden', 403, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM);
}

paymentsRouter.get('/payment-links/:linkId/status', async (req, res) => {
  const link = await prisma.paymentLink.findUnique({
    where: { id: req.params.linkId },
    select: { vendorId: true }
  });
  if (!link) {
    return res.status(404).json({ error: 'not_found' });
  }
  ensureVendorAccess(req, link.vendorId);

  const status = await getPaymentLinkService().getPaymentLinkStatus(req.params.linkId, link.vendorId);
  if (!status) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json(status);
});

paymentsRouter.post(
  '/payments/shop-funding-intent',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      throw new CustomError('Vendor context required', 403, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM);
    }
    const customerRefundId = String(req.body?.customerRefundId ?? '').trim();
    if (!customerRefundId) {
      throw new CustomError('customerRefundId is required', 400, ErrorType.VALIDATION, ErrorSeverity.LOW);
    }
    const intent = await createShopFundingCheckoutIntent(vendorId, customerRefundId);
    res.status(201).json(intent);
  })
);
