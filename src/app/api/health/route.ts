import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: 'hive-inspect-template-importer',
      db: 'connected',
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[health] database check failed:', error);
    return NextResponse.json(
      {
        ok: false,
        service: 'hive-inspect-template-importer',
        db: 'unavailable',
        error: error instanceof Error ? error.message : 'unknown error',
        time: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
