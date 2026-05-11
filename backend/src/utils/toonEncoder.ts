/**
 * TOON-style encoding for uniform arrays (CSV-like table format).
 * ~40% fewer tokens vs JSON for product catalogs. Originally lived inline in
 * unifiedAIProcessorService.ts — moved here so catalog-import extraction can
 * reuse it for enrichment batches.
 *
 * Format:
 *   "  header1,header2,header3\n  val1,val2,val3\n  val1,val2,val3"
 * Commas inside values are escaped to `;`.
 */
export function toonTable(rows: Record<string, string | number | boolean | null | undefined>[]): string {
  if (!rows || rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const data = rows
    .map((r) =>
      keys
        .map((k) => {
          const v = r[k];
          const str = v == null ? '' : String(v);
          return str.replace(/,/g, ';');
        })
        .join(',')
    )
    .join('\n  ');
  return `  ${header}\n  ${data}`;
}
