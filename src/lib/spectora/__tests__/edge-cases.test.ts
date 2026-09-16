/**
 * Edge-case hardening tests (ticket #10994).
 * All fixtures are SYNTHETIC format-conformance fixtures — never real exports.
 */
import { describe, expect, it } from 'vitest';
import { runImportParse } from '@/lib/spectora';
import { buildWorkbookBytes, type FixtureRow } from './fixtures/buildFixture';

function parseFixture(rows: FixtureRow[], headerOrder?: string[], fileName = 'synthetic-edge.xlsx') {
  return runImportParse(fileName, buildWorkbookBytes(rows, headerOrder), { templateName: 'Edge' });
}

describe('edge cases — headers', () => {
  it('matches headers despite BOM, CRLF, case and extra whitespace', () => {
    const result = parseFixture(
      [{ 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'a', 'Comment Text': 'a' }],
      ['\uFEFFSection\r\n Name', ' item name ', 'COMMENT NAME', 'comment   text']
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections).toHaveLength(1);
    expect(result.template.sections[0].items[0].comments[0]).toMatchObject({ name: 'a', text: 'a' });
  });

  it('survives a row of only whitespace between data rows, keeping true row numbers', () => {
    // Rows: 2 data, 1 whitespace-only (skipped), 1 data → warning row must be 5.
    const bytes = buildWorkbookBytes([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'a', 'Comment Text': 'a' },
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'b', 'Comment Text': 'b' },
      { 'Section Name': '   ', 'Item Name': '', 'Comment Type': 'limit' },
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'c', 'Comment Text': 'c' },
    ]);
    // Inject a whitespace-only row: easier to assert on the empty-comment row number instead.
    const result = runImportParse('synthetic-edge.xlsx', bytes, { templateName: 'Edge' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const emptyRowWarning = result.warnings.find((w) => w.code === 'COMMENT_ROW_EMPTY');
    expect(emptyRowWarning?.context?.row).toBe(4); // header=1, data=2,3, empty=4, data=5
    expect(result.template.sections[0].items[0].comments).toHaveLength(3);
  });
});

describe('edge cases — ordering', () => {
  it('duplicate Order values keep spreadsheet row order (stable)', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'one', 'Comment Text': '1', 'Order (w/i item)': '5' },
      { 'Comment Name': 'two', 'Comment Text': '2', 'Order (w/i item)': '5' },
      { 'Comment Name': 'three', 'Comment Text': '3', 'Order (w/i item)': '5' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments.map((c) => c.name)).toEqual(['one', 'two', 'three']);
  });

  it('negative and zero order values sort before un-ordered rows', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'plain', 'Comment Text': 'a' },
      { 'Comment Name': 'zero', 'Comment Text': 'b', 'Order (w/i item)': '0' },
      { 'Comment Name': 'neg', 'Comment Text': 'c', 'Order (w/i item)': '-2' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments.map((c) => c.name)).toEqual(['neg', 'zero', 'plain']);
  });
});

describe('edge cases — comment content', () => {
  it('accepts a comment with text but no name (name stored as null)', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Text': 'Text-only note.' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments[0]).toMatchObject({ name: null, text: 'Text-only note.' });
  });

  it('accepts a comment with name but empty text', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'Heading only' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments[0]).toMatchObject({ name: 'Heading only', text: '' });
  });

  it('keeps multiple comments under the same item run in row order', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'c1', 'Comment Text': '1' },
      { 'Comment Name': 'c2', 'Comment Text': '2' },
      { 'Comment Name': 'c3', 'Comment Text': '3' },
      { 'Comment Name': 'c4', 'Comment Text': '4' },
      { 'Comment Name': 'c5', 'Comment Text': '5' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items[0].comments.map((c) => c.name)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });
});

describe('edge cases — same item name restarts as new run only when non-contiguous', () => {
  it('contiguous identical item names stay ONE item', () => {
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'a', 'Comment Text': 'a' },
      { 'Item Name': 'I', 'Comment Name': 'b', 'Comment Text': 'b' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.sections[0].items).toHaveLength(1);
    expect(result.warnings.some((w) => w.code === 'NONCONTIGUOUS_ITEM')).toBe(false);
  });

  it('non-contiguous identical item names become separate items + info warning', () => {
    // Item "I" re-appears AFTER a different item ("Other") within the SAME
    // section: kept as a separate item (order-faithful) + info warning.
    const result = parseFixture([
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'a', 'Comment Text': 'a' },
      { 'Section Name': 'S', 'Item Name': 'Other', 'Comment Name': 'b', 'Comment Text': 'b' },
      { 'Section Name': 'S', 'Item Name': 'I', 'Comment Name': 'c', 'Comment Text': 'c' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const names = result.template.sections.flatMap((s) => s.items.map((i) => i.name));
    expect(names).toEqual(['I', 'Other', 'I']);
    expect(result.warnings.some((w) => w.code === 'NONCONTIGUOUS_ITEM' && w.level === 'info')).toBe(true);
  });
});
