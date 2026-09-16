/**
 * Real-export conformance: Spectora annotates some canonical headers with
 * parenthetical hints, and the photo-column family goes beyond the docs.
 * Found against the real InterNACHI Residential export (2026-09-16) —
 * see samples/spectora/ and tests/import-real-file.md.
 *
 * The fixture here is synthetic but byte-shaped like the real header row.
 */
import { describe, expect, it } from 'vitest';
import { runImportParse } from '@/lib/spectora';
import { buildWorkbookBytes, type FixtureRow } from './fixtures/buildFixture';

// The real export's annotated headers (exact strings from the file).
const ANNOTATED_TYPE = 'Comment Type (info, limit, defect)';
const ANNOTATED_CATEGORY = 'Category (-1: Low, 0: Med, 1: High)';
const ANNOTATED_ORDER = 'Order (w/i item)';
const PHOTO_4 = 'Default Photo 4';
const PHOTO_10_CAPTION = 'Default Photo 10 Caption';

function parseFixture(rows: FixtureRow[], headerOrder?: string[]) {
  return runImportParse('synthetic-annotated.xlsx', buildWorkbookBytes(rows, headerOrder), {
    templateName: 'Annotated',
  });
}

describe('real-export conformance — annotated headers', () => {
  it('maps "Comment Type (info, limit, defect)" to first-class type', () => {
    const result = parseFixture([
      {
        'Section Name': 'Roof',
        'Item Name': 'Shingles',
        'Comment Name': 'Worn',
        'Comment Text': 'Worn shingles',
        [ANNOTATED_TYPE]: 'defect',
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.type).toBe('defect');
    // must NOT leak into extra — it is a first-class field
    expect(comment.extra?.['Comment Type (info, limit, defect)']).toBeUndefined();
  });

  it('maps "Category (-1: Low, 0: Med, 1: High)" to first-class category', () => {
    const result = parseFixture([
      {
        'Section Name': 'Roof',
        'Item Name': 'Shingles',
        'Comment Name': 'Worn',
        'Comment Text': 'Worn',
        [ANNOTATED_CATEGORY]: '1',
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.category).toBe(1);
    expect(comment.extra?.[ANNOTATED_CATEGORY]).toBeUndefined();
  });

  it('maps the annotated Order header to ordering', () => {
    const result = parseFixture(
      [
        {
          'Section Name': 'Roof',
          'Item Name': 'Shingles',
          'Comment Name': 'second',
          'Comment Text': '2',
          [ANNOTATED_ORDER]: '2',
        },
        {
          'Section Name': 'Roof',
          'Item Name': 'Shingles',
          'Comment Name': 'first',
          'Comment Text': '1',
          [ANNOTATED_ORDER]: '1',
        },
      ],
      ['Section Name', 'Item Name', 'Comment Name', 'Comment Text', ANNOTATED_ORDER]
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comments = result.template.sections[0].items[0].comments;
    expect(comments.map((c) => c.name)).toEqual(['first', 'second']);
  });

  it('preserves Default Photo 4..10 (+ captions) verbatim like photos 1..3', () => {
    const result = parseFixture([
      {
        'Section Name': 'Roof',
        'Item Name': 'Shingles',
        'Comment Name': 'Worn',
        'Comment Text': 'Worn',
        [PHOTO_4]: 'https://example.com/p4.jpg',
        [PHOTO_10_CAPTION]: 'cap ten',
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.extra?.[PHOTO_4]).toBe('https://example.com/p4.jpg');
    expect(comment.extra?.[PHOTO_10_CAPTION]).toBe('cap ten');
    // photos are verbatim-class columns, so no UNKNOWN_COLUMN warning for them
    const unknownWarnings = result.warnings.filter((w) => w.code === 'UNKNOWN_COLUMN');
    expect(unknownWarnings.map((w) => w.context?.column)).not.toContain(PHOTO_4);
    expect(unknownWarnings.map((w) => w.context?.column)).not.toContain(PHOTO_10_CAPTION);
  });

  it('full real-header row: type + category + order + extended photos all first-class/verbatim, zero unknown columns', () => {
    const result = parseFixture(
      [
        {
          'Section Name': 'Exterior',
          'Item Name': 'Siding',
          'Comment Name': 'Rot',
          'Comment Text': '<em>Soft rot</em>',
          [ANNOTATED_TYPE]: 'limit',
          [ANNOTATED_CATEGORY]: '0',
          [ANNOTATED_ORDER]: '1',
          'Recommendation (from list)': 'Repair',
          [PHOTO_4]: 'p4',
          [PHOTO_10_CAPTION]: 'cap10',
          'Last Modified': '2026-09-16',
        },
      ],
      [
        'Section Name',
        'Item Name',
        'Comment Name',
        'Comment Text',
        ANNOTATED_TYPE,
        ANNOTATED_CATEGORY,
        'Multiple Choice Options (comma-separated)',
        'Unit Type Options (numeric answers only, comma-separated)',
        'Recommendation (from list)',
        ANNOTATED_ORDER,
        'Answer Type (boolean, checkbox, date, number, range, text)',
        'Default Value',
        'Default Value 2 (for "range" types)',
        'Default Unit Type (for "number" and "range" types)',
        'Default Location',
        'Default Estimate Min',
        'Default Estimate Max',
        'Locked',
        'Simple Format',
        'Disable Photos',
        'Uses',
        PHOTO_4,
        PHOTO_10_CAPTION,
        'Last Modified',
      ]
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.template.sections[0].items[0].comments[0];
    expect(comment.type).toBe('limit');
    expect(comment.category).toBe(0);
    // Recommendation + Last Modified stay verbatim, keyed by CANONICAL name
    // (schema.md: "key = canonical column") even when the raw header was annotated.
    expect(comment.extra?.['Recommendation']).toBe('Repair');
    expect(comment.extra?.['Last Modified']).toBe('2026-09-16');
    expect(result.warnings.filter((w) => w.code === 'UNKNOWN_COLUMN')).toHaveLength(0);
  });
});
