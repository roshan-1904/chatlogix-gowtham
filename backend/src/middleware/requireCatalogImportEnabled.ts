import type express from 'express';
import { prisma } from '../db/prisma.js';

export async function requireCatalogImportEnabled(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    res.status(403).json({ error: 'vendor_context_missing' });
    return;
  }
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { catalogImportEnabled: true }
  });
  if (!vendor?.catalogImportEnabled) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  next();
}
