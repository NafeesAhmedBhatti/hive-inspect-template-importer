import { NextRequest, NextResponse } from 'next/server';
import { runImportParse } from '@/lib/spectora';
import { MAX_UPLOAD_BYTES } from '@/lib/spectora/readWorkbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Preview parses and reports but NEVER persists — the DB is untouched here.
// 300s (Hobby-pro capped) for the pooler's slow per-statement round-trips.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Expected a multipart form upload with a "file" field.',
          action: 'Upload the Spectora .xlsx export using the file picker on the import page.',
        },
      },
      { status: 400 }
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'NO_FILE',
          message: 'No file was uploaded.',
          action: 'Choose the Spectora "Export HTML Text" .xlsx file and try again.',
        },
      },
      { status: 400 }
    );
  }

  // Center name/template name override (optional form field).
  const nameField = form.get('templateName');
  const templateName = typeof nameField === 'string' && nameField.trim() !== '' ? nameField.trim() : undefined;

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `The file is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is 25 MB.`,
          action: 'Export a single template (not the whole account) to stay under the size cap.',
        },
      },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = runImportParse(file.name, bytes, { templateName });

  if (!result.ok) {
    // Hard parse/validation failure — actionable error, never a silent 200.
    return NextResponse.json(result, { status: 422 });
  }

  return NextResponse.json(result);
}
