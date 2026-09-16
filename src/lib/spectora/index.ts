import { parse } from './parse';
import { buildReport } from './report';
import { readWorkbook } from './readWorkbook';
import type { ImportResult } from './types';

/**
 * Full pipeline: bytes → validated workbook → parse → IR + preservation
 * report + warnings. Pure and persistence-free — the preview API returns
 * this JSON and nothing touches the database until the user confirms.
 */
export function runImportParse(
  fileName: string,
  bytes: Uint8Array,
  opts?: { templateName?: string }
): ImportResult {
  const read = readWorkbook(fileName, bytes);
  if (!read.ok) {
    return {
      ok: false,
      error: { code: read.code, message: read.message, action: read.action },
    };
  }

  const fallbackName = fileName.replace(/\.(xlsx|xls)$/i, '').trim() || 'Imported template';
  const parsed = parse(read.workbook, {
    templateName: opts?.templateName?.trim() || fallbackName,
    sourceFileName: fileName,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      error: { code: parsed.code, message: parsed.message, action: parsed.action },
    };
  }

  return {
    ok: true,
    template: parsed.template,
    report: buildReport(read.workbook, parsed.template),
    warnings: parsed.warnings,
  };
}
