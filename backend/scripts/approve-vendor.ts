#!/usr/bin/env npx tsx
/**
 * Ops helper: approve a vendor and send notification stub.
 * Usage: npx tsx scripts/approve-vendor.ts +919876543210 ops@chatlogix.in
 */
import { prisma } from '../src/db/prisma.js';
import { notifyVendorApproved } from '../src/services/vendorApprovalNotificationService.js';
import { logOnboardingFunnelEvent } from '../src/services/onboardingFunnelService.js';

const phone = process.argv[2];
const approvedBy = process.argv[3] ?? 'ops@chatlogix.in';

if (!phone) {
  console.error('Usage: npx tsx scripts/approve-vendor.ts <E.164 phone> [approvedBy]');
  process.exit(1);
}

const vendor = await prisma.vendor.findUnique({ where: { phone } });
if (!vendor) {
  console.error('Vendor not found for phone:', phone);
  process.exit(1);
}

await prisma.vendor.update({
  where: { id: vendor.id },
  data: {
    registrationStatus: 'approved',
    approvedAt: new Date(),
    approvedBy,
    subscriptionStatus: 'active',
    walletBalanceMilli: 0
  }
});

logOnboardingFunnelEvent('approved', { vendorId: vendor.id, approvedBy });

await notifyVendorApproved({
  phone: vendor.phone,
  businessName: vendor.businessName,
  loginUrl: process.env.VENDOR_PORTAL_URL ?? 'http://127.0.0.1:3000/login'
});

console.log('Approved vendor', vendor.id, vendor.phone);
