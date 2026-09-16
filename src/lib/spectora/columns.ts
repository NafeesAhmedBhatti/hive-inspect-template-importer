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

/**
 * Real Spectora exports annotate some headers with parenthetical hints
 * (e.g. "Comment Type (info, limit, defect)", "Category (-1: Low, 0: Med, 1: High)").
 * After normalizeHeader those still differ from the bare canonical name, so we
 * also strip a trailing parenthetical before matching — but ONLY for first-class
 * columns, never as a license to fuzzy-match arbitrary columns.
 */
export function stripHeaderAnnotation(normalized: string): string {
  return normalized.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

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
  // Photo family: real exports carry up to 10 slots (docs mention 3).
  ...Array.from({ length: 10 }, (_, i) => `Default Photo ${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `Default Photo ${i + 1} Caption`),
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

/**
 * Normalize a header cell the way Spectora/Excel exports vary in the wild:
 * strip BOM, convert newlines (CRLF/LF) and runs of whitespace to single
 * spaces, collapse unicode spaces, trim — matching is then case-insensitive.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/\uFEFF/g, '')
    .replace(/\r\n?[\u00A0 ]?/g, ' ')
    .replace(/[\u00A0\u2000-\u200B]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
    const trimmed = (raw ?? '').trim();
    const norm = normalizeHeader(trimmed);
    if (norm === '') return; // trailing empty header cells are structural, not data
    let canonical = canonicalByNorm.get(norm);
    if (!canonical) {
      // Real exports annotate headers ("Category (-1: Low, 0: Med, 1: High)").
      // Strip one trailing parenthetical and retry — canonical names still win.
      canonical = canonicalByNorm.get(stripHeaderAnnotation(norm));
    }
    if (canonical) {
      matches.push({ canonical, raw: trimmed, index });
    } else {
      unknown.push({ raw: trimmed, index });
    }
  });
  return { matches, unknown };
}
