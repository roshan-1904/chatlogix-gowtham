import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { grossPaiseForTargetNetMilli } from './settlementMath.js';
import { getRazorpayApiClient } from './razorpayApiClient.js';
import { taxRatesForVendorId } from './settlementTax.js';

function assertRazorpayConfigured(): { keyId: string } {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw createError('Razorpay is not configured', 503, ErrorType.PAYMENT, undefined, {
      error: 'razorpay_not_configured'
    });
  }
  return { keyId };
}

export async function createShopFundingCheckoutIntent(vendorId: string, customerRefundId: string) {
  const refund = await prisma.customerRefund.findUnique({
    where: { id: customerRefundId },
    include: { customerPayment: true }
  });
  if (!refund || refund.vendorId !== vendorId) {
    throw createError('Refund not found', 404, ErrorType.NOT_FOUND);
  }
  if (refund.status !== 'awaiting_funding') {
    throw createError('Refund is not awaiting funding', 409, ErrorType.PAYMENT);
  }
  if (refund.shortfallMilli <= 0n) {
    throw createError('No funding required for this refund', 409, ErrorType.PAYMENT);
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { paymentFeeBps: true, panEncrypted: true }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const taxRates = taxRatesForVendorId(vendor);
  const amountPaise = grossPaiseForTargetNetMilli({
    targetNetMilli: refund.shortfallMilli,
    paymentFeeBps: vendor.paymentFeeBps,
    gstTcsBps: taxRates.gstTcsBps,
    tdsBps: taxRates.tdsBps
  });

  const { keyId } = assertRazorpayConfigured();
  const order = await getRazorpayApiClient().createOrder({
    amountPaise,
    receipt: customerRefundId.replace(/-/g, '').slice(0, 40),
    notes: {
      purpose: 'shop_funding',
      vendorId,
      customerRefundId
    }
  });

  return {
    customerRefundId,
    amountPaise,
    shortfallMilli: refund.shortfallMilli.toString(),
    clientAction: {
      type: 'razorpay_checkout' as const,
      orderId: order.id,
      amountPaise,
      keyId
    }
  };
}
