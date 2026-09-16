import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { persistTemplate, ImportServiceError } from '@/lib/services/importService';
import type { ImportReport, ImportWarning, ParsedTemplate } from '@/lib/spectora/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CommitBody {
  template: ParsedTemplate;
  warnings: ImportWarning[];
  report: ImportReport;
  templateName?: string;
}

/** GET /api/templates — list templates with section/item/comment counts. */
export async function GET() {
  try {
    const templates = await prisma.template.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        source: true,
        sourceFileName: true,
        isSynthetic: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            sections: {
              // Prisma cannot nest counts two levels deep in _count; items and
              // comments are summed via aggregate below for accuracy.
            },
          },
        },
      },
    });

    // Sum items + comments per template from grouped queries (accurate counts).
    const sectionsByTemplate = await prisma.section.groupBy({
      by: ['templateId'],
      _count: { _all: true },
    });
    const itemsByTemplate = await prisma.item.groupBy({
      by: ['templateId'],
      _count: { _all: true },
    });

    const commentsByTemplate = await prisma.$queryRaw<{ templateid: string; count: bigint }[]>`
      SELECT s."templateId" as templateid, COUNT(c.id) as count
      FROM comments c
      JOIN items i ON i.id = c."itemId"
      JOIN sections s ON s.id = i."sectionId"
      GROUP BY s."templateId"
    `;

    const sectionMap = new Map(sectionsByTemplate.map((r) => [r.templateId, r._count._all]));
    const itemMap = new Map(itemsByTemplate.map((r) => [r.templateId, r._count._all]));
    const commentMap = new Map(commentsByTemplate.map((r) => [r.templateid, Number(r.count)]));

    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        source: t.source,
        sourceFileName: t.sourceFileName,
        isSynthetic: t.isSynthetic,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        counts: {
          sections: sectionMap.get(t.id) ?? 0,
          items: itemMap.get(t.id) ?? 0,
          comments: commentMap.get(t.id) ?? 0,
        },
      })),
    });
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
