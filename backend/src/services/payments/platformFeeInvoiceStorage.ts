import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';
import { getWaMediaS3Client } from '../../utils/waMediaS3.js';

const LOCAL_PREFIX = 'local:';

function invoiceBucket(): string | null {
  const dedicated = env.SETTLEMENT_INVOICE_S3_BUCKET?.trim();
  if (dedicated) return dedicated;
  const wa = env.WA_MEDIA_S3_BUCKET?.trim();
  return wa || null;
}

export function buildInvoiceS3Key(vendorId: string, monthKey: string, invoiceDisplay: string): string {
  const safeName = invoiceDisplay.replace(/[^A-Za-z0-9_-]/g, '_');
  return `vendor/${vendorId}/platform-fee-invoices/${monthKey}/${safeName}.pdf`;
}

export async function storePlatformFeeInvoicePdf(input: {
  vendorId: string;
  monthKey: string;
  invoiceDisplay: string;
  pdf: Buffer;
}): Promise<{ pdfS3Key: string; storage: 's3' | 'local' }> {
  const key = buildInvoiceS3Key(input.vendorId, input.monthKey, input.invoiceDisplay);
  const bucket = invoiceBucket();
  if (bucket) {
    await getWaMediaS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.pdf,
        ContentType: 'application/pdf',
        Tagging: 'ChatLogixDocClass=platform-fee-invoice'
      })
    );
    return { pdfS3Key: key, storage: 's3' };
  }

  const localRoot = path.resolve(process.cwd(), '.data/platform-fee-invoices');
  const relative = path.join(input.vendorId, `${input.monthKey}-${input.invoiceDisplay}.pdf`);
  const fullPath = path.join(localRoot, relative);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, input.pdf);
  logger.warn({ fullPath }, 'platform fee invoice stored locally — set SETTLEMENT_INVOICE_S3_BUCKET for S3');
  return { pdfS3Key: `${LOCAL_PREFIX}${relative.replace(/\\/g, '/')}`, storage: 'local' };
}

export async function presignPlatformFeeInvoicePdf(pdfS3Key: string): Promise<string | null> {
  if (pdfS3Key.startsWith(LOCAL_PREFIX)) {
    return null;
  }
  const bucket = invoiceBucket();
  if (!bucket) return null;
  const command = new GetObjectCommand({ Bucket: bucket, Key: pdfS3Key });
  return getSignedUrl(getWaMediaS3Client(), command, { expiresIn: 15 * 60 });
}

export async function readLocalPlatformFeeInvoicePdf(pdfS3Key: string): Promise<Buffer | null> {
  if (!pdfS3Key.startsWith(LOCAL_PREFIX)) return null;
  const relative = pdfS3Key.slice(LOCAL_PREFIX.length);
  const fullPath = path.resolve(process.cwd(), '.data/platform-fee-invoices', relative);
  const { readFile } = await import('node:fs/promises');
  try {
    return await readFile(fullPath);
  } catch {
    return null;
  }
}
