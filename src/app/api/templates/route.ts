import { NextRequest, NextResponse } from 'next/server';
import { listTemplates } from '@/lib/services/templateService';
import { persistTemplate, ImportServiceError } from '@/lib/services/importService';
import type { ImportReport, ImportWarning, ParsedTemplate } from '@/lib/spectora/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Commit runs an interactive transaction (~480 INSERTs on a real export);
// serverless poolers need a long window — align with vercel.json.
export const maxDuration = 300;

interface CommitBody {
  template: ParsedTemplate;
  warnings: ImportWarning[];
  report: ImportReport;
  templateName?: string;
}

/** GET /api/templates — list templates with real section/item/comment counts. */
export async function GET() {
  try {
    const templates = await listTemplates();
    return NextResponse.json({ templates });
  } catch (e) {
    console.error('[templates:list]', e);
    return NextResponse.json({ error: { code: 'LIST_FAILED', message: 'Could not load templates.' } }, { status: 500 });
  }
}

/** POST /api/templates — commit a parsed IR (from the preview step) in ONE transaction. */
export async function POST(request: NextRequest) {
  let body: CommitBody;
  try {
    body = (await request.json()) as CommitBody;
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_JSON', message: 'Request body must be the JSON produced by the import preview.' } },
      { status: 400 }
    );
  }

  if (!body?.template || !Array.isArray(body.template.sections)) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Missing parsed template data — run the preview step first.',
          action: 'Upload the .xlsx again; the preview must complete before importing.',
        },
      },
      { status: 400 }
    );
  }

  try {
    const created = await persistTemplate({
      template: body.template,
      warnings: body.warnings ?? [],
      report: body.report,
      templateName: body.templateName,
    });
    return NextResponse.json({ template: created }, { status: 201 });
  } catch (e) {
    if (e instanceof ImportServiceError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 422 });
    }
    console.error('[templates:create]', e);
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Unexpected error while saving the template — nothing was committed.' } },
      { status: 500 }
    );
  }
}
