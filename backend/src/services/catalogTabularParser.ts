import ExcelJS from 'exceljs';
import { logger } from '../logger.js';

export interface TabularRow {
  raw: Record<string, string>;
  rowIndex: number;
  source: 'csv' | 'xlsx';
}

/**
 * Minimal RFC-4180 CSV parser. Handles quoted fields, escaped quotes, and
 * \r\n / \n line endings. Sufficient for vendor price-list uploads (< 5 MB).
 * We intentionally avoid pulling in `papaparse` for this one narrow use.
 */
export function parseCsv(buffer: Buffer): TabularRow[] {
  const text = buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const out: TabularRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const raw: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      raw[headers[c]] = (rows[r][c] ?? '').trim();
    }
    out.push({ raw, rowIndex: r, source: 'csv' });
  }
  return out;
}

export async function parseXlsx(buffer: Buffer): Promise<TabularRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const namedRange = workbook.definedNames.getRanges('productCatalog');
  let sheetName: string | undefined;
  if (namedRange && namedRange.ranges.length > 0) {
    // "Sheet1!A1:F200" → "Sheet1"
    const first = namedRange.ranges[0];
    sheetName = first.split('!')[0].replace(/^'|'$/g, '');
  }
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim();
  });
  if (headers.length === 0) return [];

  const out: TabularRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Record<string, string> = {};
    let hasAny = false;
    for (let c = 0; c < headers.length; c++) {
      const cell = row.getCell(c + 1);
      const v = cell.value;
      const str = v == null ? '' : typeof v === 'object' && 'text' in (v as any) ? String((v as any).text) : String(v);
      raw[headers[c]] = str.trim();
      if (str.trim() !== '') hasAny = true;
    }
    if (hasAny) out.push({ raw, rowIndex: rowNumber, source: 'xlsx' });
  });
  return out;
}

export async function parseTabular(
  buffer: Buffer,
  contentType: string
): Promise<TabularRow[]> {
  try {
    if (contentType === 'text/csv') return parseCsv(buffer);
    if (
      contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      contentType === 'application/octet-stream' // some browsers mis-report
    ) {
      return await parseXlsx(buffer);
    }
  } catch (err) {
    logger.warn({ err, contentType }, 'tabular_parse_failed');
  }
  return [];
}
