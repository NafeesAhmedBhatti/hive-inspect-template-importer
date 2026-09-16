/**
 * Unit tests — parse core behavior.
 * All fixtures here are SYNTHETIC format-conformance fixtures, NOT real
 * Spectora exports (see fixtures/buildFixture.ts header).
 */
import { describe, expect, it } from 'vitest';
import { runImportParse } from '@/lib/spectora';
import { buildEmptyWorkbookBytes, buildWorkbookBytes, type FixtureRow } from './fixtures/buildFixture';

function parseFixture(rows: FixtureRow[], headerOrder?: string[], fileName = 'synthetic-fixture.xlsx') {
  return runImportParse(fileName, buildWorkbookBytes(rows, headerOrder), { templateName: 'Fixture' });
}

describe('readWorkbook (via pipeline)', () => {
  it('rejects non-Excel files with an actionable error', () => {
    const result = runImportParse('notes.txt', new Uint8Array([1, 2, 3]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNSUPPORTED_EXTENSION');
      expect(result.error.action).toMatch(/Export HTML Text/);
    }
  });

  it('rejects a fake .xlsx (wrong magic bytes)', () => {
    const fake = new TextEncoder().encode('this is not a zip file at all........');
    const result = runImportParse('fake.xlsx', fake);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_A_REAL_XLSX');
  });

  it('accepts .xls with a warning suggesting xlsx', () => {
    const rows: FixtureRow[] = [
      { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'Worn', 'Comment Text': 'Flashing worn.' },
    ];
    // Build an xlsx payload but name it .xls — the container sniff (PK zip)
    // accepts it, and the extension adds a prefer-xlsx warning.
    const result = runImportParse('legacy.xls', buildWorkbookBytes(rows));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const codes = result.warnings.map((w) => w.code);
      expect(codes).toContain('XLS_EXTENSION');
    }
  });

  it('rejects a workbook with no header row', () => {
    const result = runImportParse('empty.xlsx', buildEmptyWorkbookBytes());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NO_HEADER_ROW');
  });
});

describe('parse — hierarchy and ordering', () => {
  it('groups consecutive rows into Section → Item → Comment with encounter-order positions', () => {
    const result = parseFixture([
      { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'Worn', 'Comment Text': 'Worn shingles.' },
      { 'Comment Name': 'Missing', 'Comment Text': 'Missing shingles.' }, // continuation comment
      { 'Item Name': 'Flashing', 'Comment Name': 'Rusted', 'Comment Text': 'Rusted flashing.', 'Comment Type': 'defect', 'Category': '1' }, // no section → (Unfiled)
      { 'Section Name': 'Electrical', 'Item Name': 'Panel', 'Comment Name': 'Double tap', 'Comment Text': 'Double tapped breaker.' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { template, report, warnings } = result;

    // The section-less item row lands in "(Unfiled)" — order-faithful.
    expect(template.sections.map((s) => s.name)).toEqual(['Roof', '(Unfiled)', 'Electrical']);
    expect(template.sections[0].items.map((i) => i.name)).toEqual(['Shingles']);
    expect(template.sections[0].items[0].comments.map((c) => c.name)).toEqual(['Worn', 'Missing']);
    expect(template.sections[0].items[0].comments.map((c) => c.position)).toEqual([0, 1]);
    expect(template.sections[1].items.map((i) => i.name)).toEqual(['Flashing']);
    expect(template.sections[1].items[0].comments[0]).toMatchObject({ type: 'defect', category: 1 });

    expect(warnings.some((w) => w.code === 'ITEM_WITHOUT_SECTION' && w.level === 'warning')).toBe(true);
    expect(report.totals).toMatchObject({ sections: 3, items: 3, comments: 4 });
    expect(report.totals.commentTypeBreakdown).toEqual({ info: 3, defect: 1 });
  });

  it('preserves rich HTML in comment text byte-for-byte', () => {
    // NOTE: entity-free HTML on purpose — the fixture builder is SheetJS-based
    // and does not re-escape "&" on write (documented quirk); real Excel
    // exports are unaffected. Entities are covered in sanitize tests.
    const html = '<p style="color: #ff0000">Water <b>damage</b> and stains <em>observed</em> under windows</p>';
    const result = parseFixture([
      { 'Section Name': 'Plumbing', 'Item Name': 'Water heater', 'Comment Name': 'Leak', 'Comment Text': html },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments[0].text).toBe(html);
    const col = result.report.columns.find((c) => c.column === 'Comment Text');
    expect(col?.status).toBe('rich_content_detected');
    expect(col?.richContentRows).toBe(1);
  });

  it('keeps non-contiguous duplicate sections separate (order-faithful) with an info warning', () => {
    const result = parseFixture([
      { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'a', 'Comment Text': 'a' },
      { 'Section Name': 'Electrical', 'Item Name': 'Panel', 'Comment Name': 'b', 'Comment Text': 'b' },
      { 'Section Name': 'Roof', 'Item Name': 'Flashing', 'Comment Name': 'c', 'Comment Text': 'c' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections.map((s) => s.name)).toEqual(['Roof', 'Electrical', 'Roof']);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('NONCONTIGUOUS_SECTION');
    const w = result.warnings.find((x) => x.code === 'NONCONTIGUOUS_SECTION')!;
    expect(w.level).toBe('info');
    expect(w.context).toMatchObject({ row: 4, section: 'Roof' });
  });

  it('files section-less items under "(Unfiled)" with a warning', () => {
    const result = parseFixture([
      { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'a', 'Comment Text': 'a' },
      { 'Item Name': 'Loose item', 'Comment Name': 'b', 'Comment Text': 'b' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections.map((s) => s.name)).toEqual(['Roof', '(Unfiled)']);
    expect(result.warnings.some((w) => w.code === 'ITEM_WITHOUT_SECTION')).toBe(true);
  });

  it('skips rows with empty comment name+text but warns with location context', () => {
    const result = parseFixture([
      { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'a', 'Comment Text': 'a' },
      { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Type': 'limit', 'Category': '0' },
      { 'Section Name': 'Roof', 'Item Name': 'Shingles', 'Comment Name': 'b', 'Comment Text': 'b' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments).toHaveLength(2);
    const w = result.warnings.find((x) => x.code === 'COMMENT_ROW_EMPTY');
    expect(w).toBeTruthy();
    expect(w!.context).toMatchObject({ row: 3, section: 'Roof', item: 'Shingles' });
  });

  it('treats a section-only / item-only row as a normal comment-less item (no warning)', () => {
    const result = parseFixture([
      { 'Section Name': 'Roof', 'Item Name': 'Shingles' },
      { 'Section Name': 'Roof', 'Item Name': 'Underlayment', 'Comment Name': 'ok', 'Comment Text': 'ok' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(0);
    expect(result.template.sections[0].items[0].comments).toHaveLength(0);
  });

  it('applies Order (w/i item) as a stable within-item sort, ties keep row order', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'first-in-row', 'Comment Text': '1', 'Order (w/i item)': '2' },
      { 'Comment Name': 'second-in-row', 'Comment Text': '2', 'Order (w/i item)': '1' },
      { 'Comment Name': 'third-in-row', 'Comment Text': '3', 'Order (w/i item)': '1' },
      { 'Comment Name': 'no-order', 'Comment Text': '4' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.template.sections[0].items[0].comments.map((c) => c.name);
    expect(names).toEqual(['second-in-row', 'third-in-row', 'first-in-row', 'no-order']);
    expect(result.warnings.some((w) => w.code === 'ORDER_APPLIED')).toBe(true);
    const positions = result.template.sections[0].items[0].comments.map((c) => c.position);
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it('normalizes comment types and flags unknown ones as "unknown"', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'a', 'Comment Text': 'a', 'Comment Type': 'LIMIT' },
      { 'Comment Name': 'b', 'Comment Text': 'b', 'Comment Type': 'weird-type' },
      { 'Comment Name': 'c', 'Comment Text': 'c' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const types = result.template.sections[0].items[0].comments.map((c) => c.type);
    expect(types).toEqual(['limit', 'unknown', 'info']);
    expect(result.warnings.some((w) => w.code === 'COMMENT_TYPE_UNRECOGNIZED' && w.level === 'info')).toBe(true);
  });

  it('rejects non-numeric categories into extra with a warning', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'a', 'Comment Text': 'a', 'Category': 'high' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.category).toBeNull();
    expect(comment.extra).toMatchObject({ Category: 'high' });
    expect(result.warnings.some((w) => w.code === 'CATEGORY_UNRECOGNIZED')).toBe(true);
  });
});

describe('parse — failures', () => {
  it('missing required columns → hard error naming the absent column(s)', () => {
    const result = runImportParse(
      'broken.xlsx',
      buildWorkbookBytes(
        [
          { 'Comment Name': 'a', 'Comment Text': 'b' } as FixtureRow,
        ],
        ['Comment Name', 'Comment Text']
      )
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_REQUIRED_COLUMNS');
      expect(result.error.message).toContain('"Section Name"');
      expect(result.error.message).toContain('"Item Name"');
    }
  });
});

describe('parse — verbatim + unknown columns', () => {
  it('stores populated verbatim columns into extra and reports them', () => {
    const result = parseFixture([
      {
        'Section Name': 'S',
        'Item Name': 'I',
        'Comment Name': 'a',
        'Comment Text': 'a',
        'Recommendation': 'Seal around the flange.',
        'Default Estimate Min': '10',
        'Last Modified': '2026-01-02',
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.extra).toMatchObject({
      Recommendation: 'Seal around the flange.',
      'Default Estimate Min': '10',
      'Last Modified': '2026-01-02',
    });
    const rec = result.report.columns.find((c) => c.column === 'Recommendation');
    expect(rec?.status).toBe('stored_verbatim');
    expect(rec?.populatedRows).toBe(1);
    const dv = result.report.columns.find((c) => c.column === 'Default Value');
    expect(dv?.status).toBe('absent_in_source');
  });

  it('handles reordered and missing optional columns without data loss', () => {
    const result = parseFixture(
      [
        { 'Item Name': 'I', 'Comment Text': 'txt', 'Section Name': 'S', 'Comment Name': 'N', 'Category': '-1' } as FixtureRow,
      ],
      ['Item Name', 'Comment Text', 'Section Name', 'Comment Name', 'Category']
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment).toMatchObject({ name: 'N', text: 'txt', type: 'info', category: -1 });
  });

  it('preserves unknown columns verbatim into extra and lists them in the report', () => {
    const result = parseFixture(
      [
        { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'a', 'Comment Text': 'a', 'CompanyId': 'xyz-1' } as FixtureRow,
      ],
      ['Section Name', 'Item Name', 'Comment Name', 'Comment Text', 'CompanyId']
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.extra).toMatchObject({ CompanyId: 'xyz-1' });
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_COLUMN')).toBe(true);
    expect(result.report.unknownColumns).toContain('CompanyId');
    const entry = result.report.columns.find((c) => c.column === 'CompanyId');
    expect(entry?.status).toBe('unknown_column');
    expect(entry?.sampleValues).toContain('xyz-1');
  });
});
