import { NextResponse } from 'next/server';
import { listTemplates } from '@/lib/services/templateService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/templates/list — JSON list for the dashboard client. */
export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}
