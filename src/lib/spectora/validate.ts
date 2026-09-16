/**
 * Pre-parse validation gates that operate on raw upload metadata.
 * (Extension/magic-byte/header checks live in readWorkbook.ts; this module is
 * the thin entry the API route calls first so failures are cheap and clear.)
 */
export interface ValidationFailure {
  ok: false;
  error: { code: string; message: string; action: string };
}

export function validateFile(
  fileName: string,
  bytes: Uint8Array
): { ok: true } | ValidationFailure {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_EXTENSION',
        message: `"${fileName}" is not an Excel export (expected .xlsx).`,
        action: 'Re-export from Spectora using "Export to spreadsheet → Export HTML Text" and upload the .xlsx file.',
      },
    };
  }
  if (bytes.length === 0) {
    return {
      ok: false,
      error: { code: 'EMPTY_FILE', message: 'The uploaded file is empty.', action: 'Re-export the template and try again.' },
    };
  }
  const MAX = 25 * 1024 * 1024;
  if (bytes.length > MAX) {
    return {
      ok: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `The file is ${(bytes.length / (1024 * 1024)).toFixed(1)} MB; the limit is 25 MB.`,
        action: 'Export a single template (not the whole account) to stay under the size cap.',
      },
    };
  }
  return { ok: true };
}
