/**
 * Integration tests — importService persistence against the dev Postgres.
 * These run against the real database (localhost:54329) and clean up after
 * themselves. Requires the `postgres` background service to be up.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { persistTemplate, ImportServiceError } from '@/lib/services/importService';
import { runImportParse } from '@/lib/spectora';
import { buildWorkbookBytes, type FixtureRow } from '@/lib/spectora/__tests__/fixtures/buildFixture';

/** SYNTHETIC format-conformance fixture rows — not a real export. */
const FIXTURE_ROWS: FixtureRow[] = [
  { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'Worn', 'Comment Text': '<p>Worn <b>shingles</b></p>', 'Comment Type': 'defect', 'Category': '1', 'Recommendation': 'Replace.' },
  { 'Section Name': 'Roof', 'Item Name': 'Underlayment', 'Comment Name': 'Torn', 'Comment Text': 'Torn.', 'Comment Type': 'info' },
  { 'Section Name': 'Electrical', 'Item Name': 'Panel', 'Comment Name': 'Double tap', 'Comment Text': 'Two wires.', 'Comment Type': 'defect', 'Category': '1' },
];

const prisma = new PrismaClient();
const createdIds: string[] = [];

async function persistFixture() {
  const parsed = runImportParse('synthetic-service-test.xlsx', buildWorkbookBytes(FIXTURE_ROWS), {
    templateName: 'Service test template',
  });
  if (!parsed.ok) throw new Error('fixture failed to parse: ' + parsed.error.code);
  const created = await persistTemplate({
    template: parsed.template,
    warnings: parsed.warnings,
    report: parsed.report,
  });
  createdIds.push(created.id);
  return { parsed, created };
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`; // fail fast when the DB is down
});

afterAll(async () => {
  await prisma.template.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.$disconnect();
});

describe('importService.persistTemplate', () => {
  it('commits the full IR in one transaction with correct counts and order', async () => {
    const { parsed, created } = await persistFixture();

    const db = await prisma.template.findUnique({
      where: { id: created.id },
      include: {
        sections: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' }, include: { comments: { orderBy: { position: 'asc' } } } } } },
      },
    });
    expect(db).not.toBeNull();
    expect(db!.name).toBe('Service test template');
    expect(db!.source).toBe('spectora_html_text');
    expect(db!.sourceFileName).toBe('synthetic-service-test.xlsx');
    expect(db!.isSynthetic).toBe(false);

    expect(db!.sections.map((s) => s.name)).toEqual(['Roof', 'Electrical']);
    const roof = db!.sections[0];
    expect(roof.items.map((i) => i.name)).toEqual(['Shingles', 'Underlayment']);
    const shingles = roof.items[0];
    expect(shingles.comments).toHaveLength(1);
    expect(shingles.comments[0]).toMatchObject({
      name: 'Worn',
      text: '<p>Worn <b>shingles</b></p>', // raw HTML preserved in storage
      type: 'defect',
      category: 1,
      position: 0,
    });
    expect(shingles.comments[0].extra).toMatchObject({ Recommendation: 'Replace.' });

    // importSummary snapshot stored (audit)
    const summary = db!.importSummary as { totals: { comments: number } };
    expect(summary.totals.comments).toBe(parsed.report.totals.comments);
  });

  it('leaves nothing behind when persistence fails midway (compensating delete across chunks)', async () => {
    const parsed = runImportParse('rollback-test.xlsx', buildWorkbookBytes(FIXTURE_ROWS), {
      templateName: 'Rollback test',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Sabotage: break an item name to null (NOT NULL violation) on the LAST
    // section. Persistence is chunked per section now (serverless pooler
    // safety — see importService.ts), so earlier sections are already
    // committed when the last chunk fails: the compensating delete must
    // remove the partial template, preserving all-or-nothing semantics.
    const broken = structuredClone(parsed.template) as typeof parsed.template;
    broken.sections[broken.sections.length - 1].items[0].name = undefined as unknown as string;

    await expect(
      persistTemplate({ template: broken, warnings: parsed.warnings, report: parsed.report })
    ).rejects.toBeInstanceOf(ImportServiceError);

    const leftover = await prisma.template.findMany({ where: { name: 'Rollback test' } });
    expect(leftover).toHaveLength(0); // compensating delete removed everything
  });

  it('rejects an empty template', async () => {
    await expect(
      persistTemplate({
        template: { name: 'x', source: 'spectora_html_text', sourceFileName: 'x.xlsx', sections: [] },
        warnings: [],
        report: { totals: { sections: 0, items: 0, comments: 0, commentTypeBreakdown: {} }, columns: [], unknownColumns: [] },
      })
    ).rejects.toMatchObject({ code: 'EMPTY_TEMPLATE' });
  });
});
