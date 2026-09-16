/**
 * Canonical Spectora "HTML Text" spreadsheet column registry.
 *
 * Classification (per .drytis/schema.md and the Spectora export docs):
 *  - firstClass  → mapped to a real, editable field in our data model
 *  - verbatim    → preserved per-comment into Comment.extra, surfaced in the
 *                  preservation report as "stored verbatim" (never dropped,
 *                  never invented)
 * Absent columns (not in the file, or entirely empty) are reported as
 * `absent_in_source` — the report must never call missing source data "lost".
 */

export const FIRST_CLASS_COLUMNS = [
  'Section Name',
  'Item Name',
  'Comment Name',
  'Comment Text',
  'Comment Type',
  'Category',
  'Order (w/i item)',
] as const;

export const VERBATIM_COLUMNS = [
  'Multiple Choice Options',
  'Unit Type Options',
  'Recommendation',
  'Answer Type',
  'Default Value',
  'Default Value 2',
  'Default Unit Type',
  'Default Location',
  'Default Estimate Min',
  'Default Estimate Max',
  'Locked',
  'Simple Format',
  'Disable Photos',
  'Uses',
  'Default Photo 1',
  'Default Photo 1 Caption',
  'Default Photo 2',
  'Default Photo 2 Caption',
  'Default Photo 3',
  'Default Photo 3 Caption',
  'Last Modified',
] as const;

/** Official-doc order, first-class first, then verbatim columns. */
export const CANONICAL_COLUMNS: readonly string[] = [
  ...FIRST_CLASS_COLUMNS,
  ...VERBATIM_COLUMNS,
];

export function isFirstClassColumn(column: string): boolean {
  return (FIRST_CLASS_COLUMNS as readonly string[]).includes(column);
}

export function isCanonicalColumn(column: string): boolean {
  return CANONICAL_COLUMNS.includes(column);
}

/** Normalize a header cell for case/whitespace-insensitive matching. */
export function normalizeHeader(raw: string): string {
  return raw.replace(/\uFEFF/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface HeaderMatch {
  /** Canonical column name this header resolves to. */
  canonical: string;
  /** Header text exactly as it appeared in the sheet. */
  raw: string;
  /** 0-based column index in the sheet. */
  index: number;
}

/**
 * Match sheet headers to the canonical registry (case/whitespace-insensitive).
 * Returns matches plus a list of unrecognized headers (never a crash — the
 * parser turns these into warnings and keeps the data in `extra`).
 */
export function matchHeaders(
  headerRow: string[]
): { matches: HeaderMatch[]; unknown: { raw: string; index: number }[] } {
  const canonicalByNorm = new Map<string, string>();
  for (const col of CANONICAL_COLUMNS) canonicalByNorm.set(normalizeHeader(col), col);

  const matches: HeaderMatch[] = [];
  const unknown: { raw: string; index: number }[] = [];
  headerRow.forEach((raw, index) => {
    const norm = normalizeHeader(raw ?? '');
    if (norm === '') return; // trailing empty header cells are structural, not data
    const canonical = canonicalByNorm.get(norm);
    if (canonical) {
      matches.push({ canonical, raw: raw.trim(), index });
    } else {
      unknown.push({ raw: raw.trim(), index });
    }
  });
  return { matches, unknown };
}
