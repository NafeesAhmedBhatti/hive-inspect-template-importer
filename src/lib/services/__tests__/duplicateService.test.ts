/**
 * Integration tests — duplicateService deep copy independence.
 * Runs against the dev Postgres; cleans up after itself.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runImportParse } from '@/lib/spectora';
import { persistTemplate } from '@/lib/services/importService';
import { duplicateTemplate } from '@/lib/services/duplicateService';
import { buildWorkbookBytes, type FixtureRow } from '@/lib/spectora/__tests__/fixtures/buildFixture';

/** SYNTHETIC format-conformance fixture rows — not a real export. */
const FIXTURE_ROWS: FixtureRow[] = [
  { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'Worn', 'Comment Text': '<p>Worn <b>shingles</b></p>', 'Comment Type': 'defect', 'Category': '1', 'Recommendation': 'Replace.', 'Locked': 'true' },
  { 'Section Name': 'Electrical', 'Item Name': 'Panel', 'Comment Name': 'Double tap', 'Comment Text': 'Two wires.', 'Comment Type': 'defect', 'Category': '1' },
];

const prisma = new PrismaClient();
const createdIds: string[] = [];

let sourceId = '';
let copyId = '';

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const parsed = runImportParse('dup-source.xlsx', buildWorkbookBytes(FIXTURE_ROWS), { templateName: 'Dup source' });
  if (!parsed.ok) throw new Error('fixture parse failed');
  const created = await persistTemplate({ template: parsed.template, warnings: parsed.warnings, report: parsed.report });
  sourceId = created.id;
  createdIds.push(sourceId);
});

afterAll(async () => {
  await prisma.template.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.$disconnect();
});

describe('duplicateService.duplicateTemplate', () => {
  it('creates an independent deep copy with (copy) suffix and provenance', async () => {
    const copy = await duplicateTemplate(sourceId);
    copyId = copy.id;
    createdIds.push(copyId);

    expect(copy.name).toBe('Dup source (copy)');

    const [src, dst] = await Promise.all([
      prisma.template.findUnique({
        where: { id: sourceId },
        include: { sections: { include: { items: { include: { comments: true } } } } },
      }),
      prisma.template.findUnique({
        where: { id: copyId },
        include: { sections: { include: { items: { include: { comments: true } } } } },
      }),
    ]);

    expect(dst).not.toBeNull();
    expect(dst!.source).toBe(`duplicate_of:${sourceId}`);
    expect(dst!.sourceFileName).toBeNull();
    expect(dst!.id).not.toBe(src!.id);

    // Structure mirrors the source exactly.
    expect(dst!.sections.map((s) => s.name)).toEqual(src!.sections.map((s) => s.name));
    for (const [sSrc, sDst] of zip(src!.sections, dst!.sections)) {
      expect(sDst.items.map((i) => i.name)).toEqual(sSrc.items.map((i) => i.name));
      for (const [iSrc, iDst] of zip(sSrc.items, sDst.items)) {
        expect(iDst.comments.map((c) => [c.name, c.text, c.type, c.category, c.position])).toEqual(
          iSrc.comments.map((c) => [c.name, c.text, c.type, c.category, c.position])
        );
        // extra carried verbatim
        expect(iDst.comments.map((c) => c.extra)).toEqual(iSrc.comments.map((c) => c.extra));
      }
    }

    // INDEPENDENCE: every row has a new ID — nothing is shared.
    const srcIds = new Set<string>([
      ...src!.sections.map((s) => s.id),
      ...src!.sections.flatMap((s) => s.items.map((i) => i.id)),
      ...src!.sections.flatMap((s) => s.items.flatMap((i) => i.comments.map((c) => c.id))),
    ]);
    const dstIds = [
      ...dst!.sections.map((s) => s.id),
      ...dst!.sections.flatMap((s) => s.items.map((i) => i.id)),
      ...dst!.sections.flatMap((s) => s.items.flatMap((i) => i.comments.map((c) => c.id))),
    ];
    for (const id of dstIds) expect(srcIds.has(id)).toBe(false);
  });

  it('editing the copy does NOT affect the source (provable independence)', async () => {
    const dst = await prisma.template.findUnique({
      where: { id: copyId },
      include: { sections: { include: { items: { include: { comments: { orderBy: { position: 'asc' } } } } } } },
    });
    const src = await prisma.template.findUnique({
      where: { id: sourceId },
      include: { sections: { include: { items: { include: { comments: { orderBy: { position: 'asc' } } } } } } },
    });

    // Mutate the COPY's first comment text.
    const dstComment = dst!.sections[0].items[0].comments[0];
    await prisma.comment.update({ where: { id: dstComment.id }, data: { text: 'MUTATED IN COPY' } });

    // Rename the copy itself.
    await prisma.template.update({ where: { id: copyId }, data: { name: 'Edited copy name' } });

    const srcAfter = await prisma.template.findUnique({
      where: { id: sourceId },
      include: { sections: { include: { items: { include: { comments: { orderBy: { position: 'asc' } } } } } } },
    });
    expect(srcAfter!.name).toBe('Dup source'); // unchanged
    expect(srcAfter!.sections[0].items[0].comments[0].text).toBe('<p>Worn <b>shingles</b></p>'); // unchanged
    expect(srcAfter!.name).not.toBe('Edited copy name');
  });

  it('404s cleanly on a missing source', async () => {
    await expect(duplicateTemplate('does-not-exist')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

function zip<T, U>(a: T[], b: U[]): [T, U][] {
  return a.map((x, i) => [x, b[i]] as [T, U]);
}
