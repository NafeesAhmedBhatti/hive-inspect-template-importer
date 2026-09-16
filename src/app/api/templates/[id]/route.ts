import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renameTemplate } from '@/lib/services/templateService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

/** GET /api/templates/[id] — full ordered tree (sections → items → comments). */
export async function GET(_request: NextRequest, { params }: Params) {
  const tree = await prisma.template.findUnique({
    where: { id: params.id },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: { items: { orderBy: { position: 'asc' }, include: { comments: { orderBy: { position: 'asc' } } } } },
      },
    },
  });
  if (!tree) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Template not found.' } }, { status: 404 });
  }
  return NextResponse.json({ template: tree });
}

/** PATCH /api/templates/[id] — rename the template. */
export async function PATCH(request: NextRequest, { params }: Params) {
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'BAD_JSON', message: 'Expected a JSON body with a "name" field.' } }, { status: 400 });
  }
  const result = await renameTemplate(params.id, body.name ?? '');
  if (!result.ok) {
    return NextResponse.json({ error: { code: result.code, message: result.message } }, { status: result.code === 'NOT_FOUND' ? 404 : 422 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/templates/[id] — delete with cascade (children removed). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const existing = await prisma.template.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Template not found.' } }, { status: 404 });
  }
  await prisma.template.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
