import { NextRequest, NextResponse } from 'next/server';
import { renameSection, EditorError } from '@/lib/services/editorService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/sections/[id] — rename a section. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'BAD_JSON', message: 'Expected JSON body.' } }, { status: 400 });
  }
  try {
    await renameSection(params.id, body.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof EditorError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === 'NOT_FOUND' ? 404 : 422 });
    }
    console.error('[sections:patch]', e);
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Update failed — nothing was changed.' } }, { status: 500 });
  }
}
