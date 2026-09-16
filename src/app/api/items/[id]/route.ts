import { NextRequest, NextResponse } from 'next/server';
import { renameItem, EditorError } from '@/lib/services/editorService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH /api/items/[id] — rename an item. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'BAD_JSON', message: 'Expected JSON body.' } }, { status: 400 });
  }
  try {
    await renameItem(params.id, body.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof EditorError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === 'NOT_FOUND' ? 404 : 422 });
    }
    console.error('[items:patch]', e);
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Update failed — nothing was changed.' } }, { status: 500 });
  }
}
