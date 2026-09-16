/**
 * ⚠️ SYNTHETIC FIXTURES — format-conformance fixtures ONLY.
 * These builders describe the STRUCTURE of a Spectora "HTML Text" spreadsheet
 * export for unit tests. They are NOT real Spectora exports and must never be
 * presented as validation against real data. The real-export gate lives in
 * tests/import-real-file.md and runs only when the user's actual .xlsx lands.
 *
 * Known SheetJS write quirk (documented in NOTES.md): aoa_to_sheet does not
 * re-escape "&" on write, so entity-containing strings (&amp; etc.) do not
 * survive a write→read round-trip in fixtures. Fixtures therefore use
 * entity-free HTML; real Excel-produced exports are unaffected.
 */
import * as XLSX from 'xlsx';

export interface FixtureRow {
  'Section Name'?: string;
  'Item Name'?: string;
  'Comment Name'?: string;
  'Comment Text'?: string;
  'Comment Type'?: string;
  'Category'?: string;
  'Order (w/i item)'?: string;
  [column: string]: string | undefined;
}

/** Union of all keys across rows, in first-seen order. */
function unionHeaders(rows: FixtureRow[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

export function buildWorkbookBytes(rows: FixtureRow[], headerOrder?: string[]): Uint8Array {
  const headers = headerOrder ?? unionHeaders(rows);
  const aoa: string[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map((h) => row[h] ?? ''));
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Template');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}

/** A workbook whose only sheet is completely empty (no header row at all). */
export function buildEmptyWorkbookBytes(): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([['']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Empty');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(out);
}
