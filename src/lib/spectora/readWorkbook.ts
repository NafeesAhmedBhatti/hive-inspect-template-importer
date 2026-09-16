import * as XLSX from 'xlsx';
import { matchHeaders, type HeaderMatch } from './columns';
import type { ImportWarning } from './types';

/**
 * SheetJS-based workbook reader: extension gate, magic-byte sniffing,
 * header-row detection (first non-empty row), and row normalization into
 * plain string records keyed by canonical column name.
 *
 * Pure library layer — no filesystem, no UI. Callers pass bytes + filename.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export interface RawWorkbook {
  sheetName: string;
  headerRowNumber: number; // 1-based, for warnings/audits
  /** Canonical column → 0-based sheet column index. */
  columnMap: Map<string, number>;
  /** Raw headers exactly as found (sparse, by index). */
  rawHeaders: string[];
  unknownHeaders: { raw: string; index: number }[];
  /** One entry per data row below the header; all values stringified + trimmed. */
  rows: RawRow[];
  /** Reader-level observations (e.g. legacy .xls extension) merged into parse warnings. */
  warnings: ImportWarning[];
}

export interface RawRow {
  /** 1-based spreadsheet row number (for warnings and audits). */
  rowNumber: number;
  cells: Map<string, string>;
}

export type ReadFailure = {
  ok: false;
  code: string;
  message: string;
  action: string;
};

const EXCEL_MIME_MAGIC = [0x50, 0x4b]; // "PK" — xlsx is a ZIP container

function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === EXCEL_MIME_MAGIC[0] && bytes[1] === EXCEL_MIME_MAGIC[1];
}

/** Legacy .xls (BIFF) begins with a compound-document signature; be lenient. */
function looksLikeLegacyXls(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf;
}

export function readWorkbook(
  fileName: string,
  bytes: Uint8Array
): { ok: true; workbook: RawWorkbook } | ReadFailure {
  const lower = fileName.toLowerCase();

  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    return {
      ok: false,
      code: 'UNSUPPORTED_EXTENSION',
      message: `"${fileName}" is not an Excel export (expected .xlsx or .xls).`,
      action: 'Re-export from Spectora using "Export to spreadsheet → Export HTML Text" and upload the .xlsx file.',
    };
  }
  if (bytes.length === 0) {
    return { ok: false, code: 'EMPTY_FILE', message: 'The uploaded file is empty.', action: 'Re-export the template and try again.' };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `The file is ${(bytes.length / (1024 * 1024)).toFixed(1)} MB; the limit is 25 MB.`,
      action: 'Export a single template (not the whole account) to stay under the size cap.',
    };
  }
  if (lower.endsWith('.xlsx') && !looksLikeZip(bytes)) {
    return {
      ok: false,
      code: 'NOT_A_REAL_XLSX',
      message: `"${fileName}" has an .xlsx extension but its contents are not an Excel workbook.`,
      action: 'The download may have been interrupted — re-export from Spectora and upload the fresh file.',
    };
  }
  if (lower.endsWith('.xls') && !looksLikeZip(bytes) && !looksLikeLegacyXls(bytes)) {
    return {
      ok: false,
      code: 'NOT_A_REAL_XLS',
      message: `"${fileName}" has an .xls extension but its contents are not a legacy Excel workbook.`,
      action: 'Re-export from Spectora — ideally as .xlsx — and try again.',
    };
  }

  let sheetRows: unknown[][];
  let sheetName: string;
  try {
    const wb = XLSX.read(bytes, { type: 'array', raw: false });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return { ok: false, code: 'NO_SHEETS', message: 'The workbook has no sheets.', action: 'Re-export the template from Spectora.' };
    }
    // Spectora exports put the template on the first sheet; if it is empty,
    // fall back to the first sheet that actually has rows.
    let sheet = wb.Sheets[firstSheetName];
    let chosen = firstSheetName;
    if (!sheet || sheet['!ref'] === undefined) {
      const withData = wb.SheetNames.find((n) => wb.Sheets[n]?.['!ref'] !== undefined);
      if (!withData) {
        return {
          ok: false,
          code: 'EMPTY_SHEET',
          message: 'The workbook contains no data rows.',
          action: 'Confirm the template has sections/items/comments, then re-export.',
        };
      }
      sheet = wb.Sheets[withData];
      chosen = withData;
    }
    sheetName = chosen;
    sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false, // keep dates/numbers as their formatted text, like the export shows them
    });
  } catch (e) {
    return {
      ok: false,
      code: 'WORKBOOK_PARSE_FAILED',
      message: `The workbook could not be read: ${e instanceof Error ? e.message : 'unknown error'}`,
      action: 'Re-export from Spectora (Export HTML Text) and upload the fresh .xlsx.',
    };
  }

  // Header row = first non-empty row.
  let headerIdx = -1;
  for (let i = 0; i < sheetRows.length; i++) {
    if ((sheetRows[i] ?? []).some((cell) => String(cell ?? '').trim() !== '')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      ok: false,
      code: 'NO_HEADER_ROW',
      message: 'No header row was found — every row is empty.',
      action: 'The export looks empty; re-export the template from Spectora.',
    };
  }

  const rawHeaders = (sheetRows[headerIdx] ?? []).map((c) => String(c ?? ''));
  const { matches, unknown } = matchHeaders(rawHeaders);

  const columnMap = new Map<string, number>();
  for (const m of matches as HeaderMatch[]) columnMap.set(m.canonical, m.index);

  const rows: RawRow[] = [];
  for (let r = headerIdx + 1; r < sheetRows.length; r++) {
    const sheetRow = sheetRows[r] ?? [];
    // Skip fully empty rows (common at export boundaries) — not user data.
    if (!sheetRow.some((cell) => String(cell ?? '').trim() !== '')) continue;

    const row = new Map<string, string>();
    for (const m of matches) {
      const v = String(sheetRow[m.index] ?? '').trim();
      if (v !== '') row.set(m.canonical, v);
    }
    for (const u of unknown) {
      const v = String(sheetRow[u.index] ?? '').trim();
      if (v !== '') row.set(`__unknown__:${u.raw}`, v);
    }
    rows.push({ rowNumber: r + 1, cells: row });
  }

  return {
    ok: true,
    workbook: {
      sheetName,
      headerRowNumber: headerIdx + 1,
      columnMap,
      rawHeaders,
      unknownHeaders: unknown,
      rows,
      warnings:
        lower.endsWith('.xls') && !lower.endsWith('.xlsx')
          ? [
              {
                level: 'info',
                code: 'XLS_EXTENSION',
                message: `"${fileName}" is a legacy .xls file — it was read, but re-exporting as .xlsx is recommended.`,
                context: { fileName },
              },
            ]
          : [],
    },
  };
}
