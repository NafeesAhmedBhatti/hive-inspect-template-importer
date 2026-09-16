import { NextRequest, NextResponse } from 'next/server';
import { duplicateTemplate, DuplicateError } from '@/lib/services/duplicateService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Deep copy of a real export = hundreds of INSERTs in one transaction; allow
// the same long window as commit (serverless pooler round-trips).
export const maxDuration = 300;

/** POST /api/templates/[id]/duplicate — transactional deep copy. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {}; // empty body is fine — the (copy) suffix is the default
  }
  try {
    const created = await duplicateTemplate(params.id, { name: body.name });
    return NextResponse.json({ template: created }, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === 'NOT_FOUND' ? 404 : 422 });
    }
    console.error('[templates:duplicate]', e);
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Duplication failed — nothing was committed.' } }, { status: 500 });
  }
}
