import { createHash } from 'node:crypto';
import {
  formatInrFromPaise,
  type PlatformFeeInvoiceTotals
} from './platformFeeInvoiceMath.js';
import {
  gatewayFeeLineLabel,
  type GatewayFeeInvoiceLineMode
} from './platformFeeInvoiceD3.js';

export interface PlatformFeeInvoicePdfInput {
  invoiceDisplay: string;
  monthKey: string;
  issuedAt: Date;
  supplierLegalName: string;
  supplierGstin: string;
  recipientLegalName: string;
  recipientGstin: string | null;
  totals: PlatformFeeInvoiceTotals;
  gatewayLineMode: GatewayFeeInvoiceLineMode;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfContentStream(lines: string[]): string {
  const textOps = lines
    .map((line, index) => {
      const y = 780 - index * 14;
      return `BT /F1 10 Tf 50 ${y} Td (${escapePdfText(line)}) Tj ET`;
    })
    .join('\n');
  return textOps;
}

/** Minimal single-page PDF (Helvetica) — enough for finance download and archival. */
export function buildPlatformFeeInvoicePdf(input: PlatformFeeInvoicePdfInput): Buffer {
  const issuedIst = input.issuedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const lines = [
    'ChatLogix — Platform fee tax invoice',
    `Invoice: ${input.invoiceDisplay}`,
    `Period (IST): ${input.monthKey}`,
    `Issued: ${issuedIst}`,
    '',
    `From: ${input.supplierLegalName} (GSTIN ${input.supplierGstin})`,
    `To: ${input.recipientLegalName}${input.recipientGstin ? ` (GSTIN ${input.recipientGstin})` : ''}`,
    '',
    `Order payments in period: ${input.totals.paymentCount}`,
    `Platform fee (inclusive of GST): INR ${formatInrFromPaise(input.totals.platformFeePaise)}`,
    `  Taxable value: INR ${formatInrFromPaise(input.totals.platformFeeTaxablePaise)}`,
    `  GST @ 18%: INR ${formatInrFromPaise(input.totals.platformFeeGstPaise)}`,
    '',
    gatewayFeeLineLabel(input.gatewayLineMode),
    `  Gateway fee: INR ${formatInrFromPaise(input.totals.gatewayFeePaise)}`,
    `  Gateway GST: INR ${formatInrFromPaise(input.totals.gatewayTaxPaise)}`,
    '',
    'This invoice is issued once and is not regenerated. Corrections require a credit note.'
  ];

  const content = buildPdfContentStream(lines);
  const contentLength = Buffer.byteLength(content, 'utf8');

  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${contentLength} >>stream\n${content}\nendstream\nendobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj'
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
