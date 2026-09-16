/**
 * Seed pipeline — PROVENANCE-FIRST.
 *
 * 1. If real Spectora exports exist under samples/spectora/*.xlsx, they are
 *    imported through the REAL parser (same code path as the upload flow).
 * 2. Otherwise, a clearly-labeled synthetic sample template is created via
 *    the same persistence path, flagged isSynthetic=true and named so it can
 *    never be confused with a real import.
 *
 * Honesty rules (see .drytis/scope.md): no fabricated counts, no claiming
 * real-export validation, and the synthetic sample is never named after a
 * real inspection brand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runImportParse } from '../src/lib/spectora';
import { persistTemplate } from '../src/lib/services/importService';
import { prisma } from '../src/lib/db';

const SAMPLES_DIR = path.resolve(process.cwd(), 'samples/spectora');

/** Clearly-labeled synthetic sample content (isSynthetic=true in the DB). */
const SYNTHETIC_SECTIONS: {
  name: string;
  items: { name: string; comments: { name: string; text: string; type: string; category: number | null; extra?: Record<string, string> }[] }[];
}[] = [
  {
    name: 'Roofing (sample)',
    items: [
      {
        name: 'Shingles',
        comments: [
          {
            name: 'Worn surfaces',
            text: '<p>Sample note: shingle granule loss visible on <b>south-facing</b> slopes.</p>',
            type: 'defect',
            category: 1,
            extra: { Recommendation: 'Sample recommendation: monitor and budget for replacement.' },
          },
          { name: 'Flashing gaps', text: 'Sample note: step flashing loose at the chimney.', type: 'limit', category: 0 },
        ],
      },
      { name: 'Gutters', comments: [{ name: 'Debris', text: 'Sample note: heavy debris in gutters.', type: 'info', category: null }] },
    ],
  },
  {
    name: 'Electrical (sample)',
    items: [{ name: 'Panel', comments: [{ name: 'Double tap', text: 'Sample note: two conductors under one breaker lug.', type: 'defect', category: 1 }] }],
  },
];

async function seedSynthetic(): Promise<void> {
  const existing = await prisma.template.findFirst({ where: { source: 'synthetic_seed' } });
  if (existing) {
    console.log(`seed: synthetic sample already present ("${existing.name}") — skipping`);
    return;
  }

  const sections = SYNTHETIC_SECTIONS.map((s, si) => ({
    name: s.name,
    position: si,
    sourceRow: 0,
    items: s.items.map((it, ii) => ({
      name: it.name,
      position: ii,
      sourceRow: 0,
      comments: it.comments.map((c, ci) => ({
        name: c.name,
        text: c.text,
        type: c.type,
        category: c.category,
        position: ci,
        extra: c.extra ?? {},
        sourceRow: 0,
      })),
    })),
  }));

  const created = await persistTemplate({
    template: { name: 'Hive Inspect — synthetic sample template', source: 'synthetic_seed', sourceFileName: '', sections },
    warnings: [
      {
        level: 'info',
        code: 'SYNTHETIC_SEED',
        message:
          'This template is SYNTHETIC sample data generated for demo purposes — it is NOT a real Spectora export and was never validated against one.',
      },
    ],
    report: {
      totals: {
        sections: sections.length,
        items: sections.reduce((n, s) => n + s.items.length, 0),
        comments: sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0),
        commentTypeBreakdown: countTypes(sections.flatMap((s) => s.items.flatMap((i) => i.comments.map((c) => c.type)))),
      },
      columns: [],
      unknownColumns: [],
    },
    source: 'synthetic_seed',
    isSynthetic: true,
    templateName: 'Hive Inspect — synthetic sample template',
  });

  console.log(`seed: created synthetic sample "${created.name}" (${created.id}) [isSynthetic=true]`);
}

function countTypes(types: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of types) out[t] = (out[t] ?? 0) + 1;
  return out;
}

async function main(): Promise<void> {
  console.log('seed: starting');
  await prisma.$queryRaw`SELECT 1`;

  let seeded = 0;
  if (fs.existsSync(SAMPLES_DIR)) {
    const files = fs.readdirSync(SAMPLES_DIR).filter((f) => f.toLowerCase().endsWith('.xlsx'));
    for (const file of files) {
      const fullPath = path.join(SAMPLES_DIR, file);
      const exists = await prisma.template.findFirst({ where: { sourceFileName: file } });
      if (exists) {
        console.log(`seed: "${file}" already imported ("${exists.name}") — skipping`);
        continue;
      }
      const bytes = new Uint8Array(fs.readFileSync(fullPath));
      const result = runImportParse(file, bytes);
      if (!result.ok) {
        console.warn(`seed: "${file}" FAILED to parse — ${result.error.code}: ${result.error.message}`);
        console.warn(`seed: ${result.error.action}`);
        continue;
      }
      const created = await persistTemplate({
        template: result.template,
        warnings: [
          ...result.warnings,
          { level: 'info', code: 'REAL_FILE_IMPORT', message: `Imported from samples/spectora/${file} through the real parser at seed time.` },
        ],
        report: result.report,
      });
      seeded++;
      console.log(`seed: imported "${file}" as "${created.name}" (${created.id}) — ${result.report.totals.sections} sections`);
    }
  } else {
    console.log('seed: no samples/spectora directory — nothing real to import (see samples/spectora/README.md)');
  }

  await seedSynthetic();
  console.log(`seed: done (${seeded} real file${seeded === 1 ? '' : 's'} imported)`);
}

main()
  .catch((e) => {
    console.error('seed: FAILED', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
