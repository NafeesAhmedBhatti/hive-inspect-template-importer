import { NextRequest, NextResponse } from 'next/server';
import { getTemplateTree } from '@/lib/services/templateService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

/** GET /api/templates/[id]/tree — ordered tree via templateService (dashboard/editor support). */
export async function GET(_request: NextRequest, { params }: Params) {
  const tree = await getTemplateTree(params.id);
  if (!tree) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Template not found.' } }, { status: 404 });
  }
  return NextResponse.json({ template: tree });
}
