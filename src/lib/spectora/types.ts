/**
 * Spectora HTML-text spreadsheet import — shared types (the intermediate
 * representation, or IR). Pure types: no UI, no DB, no file I/O.
 *
 * The IR is the contract between the parser (Phase 2), the preview/report
 * layer (Phase 3), and persistence (Phase 3). Everything the parser produces
 * is preserved — nothing from the source is silently dropped.
 */

/** Warning severity levels, in increasing order of seriousness. */
export type WarningLevel = 'info' | 'warning' | 'error';

/**
 * A single non-fatal observation collected while parsing or importing.
 * `code` values are stable, machine-readable constants (see docs in parse.ts).
 * `context` carries row/column-level location so the UI can point the user at
 * the exact source location — warnings never reference dropped data vaguely.
 */
export interface ImportWarning {
  level: WarningLevel;
  code: string;
  message: string;
  /** Where it happened, e.g. { row: 12, section: 'Roof', item: 'Shingles' } */
  context?: Record<string, unknown>;
}

export interface ParsedComment {
  /** Comment Name — nullable: some rows carry text only. */
  name: string | null;
  /** Comment Text, preserved byte-for-byte (may be raw HTML). */
  text: string;
  /** info | limit | defect | unknown (normalized from Comment Type). */
  type: string;
  /** Spectora severity: -1 low | 0 medium | 1 high | null when absent. */
  category: number | null;
  /** Encounter order within the parent item (0-based) unless Order column wins. */
  position: number;
  /**
   * Every other populated Spectora column for this row, verbatim
   * (key = canonical column name as it appeared in the registry).
   */
  extra: Record<string, string>;
  /** 1-based spreadsheet row this comment came from — for warnings and audits. */
  sourceRow: number;
}

export interface ParsedItem {
  name: string;
  position: number;
  comments: ParsedComment[];
  /** 1-based spreadsheet row of the item's first row. */
  sourceRow: number;
}

export interface ParsedSection {
  name: string;
  position: number;
  items: ParsedItem[];
  /** 1-based spreadsheet row of the section's first row. */
  sourceRow: number;
}

export interface ParsedTemplate {
  /** Template name — from a Name/Title column when present, else the file name. */
  name: string;
  source: string;
  sourceFileName: string;
  sections: ParsedSection[];
}

/** Final classification for each canonical + unknown column, for the report. */
export type ColumnStatus =
  | 'imported_first_class'
  | 'stored_verbatim'
  | 'absent_in_source'
  | 'rich_content_detected'
  | 'unknown_column';

export interface ColumnReportEntry {
  column: string;
  status: ColumnStatus;
  /** Number of rows where this column was populated (0 for absent_in_source). */
  populatedRows: number;
  /** Number of cells whose value contains HTML markup. */
  richContentRows: number;
  /** Unknown columns only: which values were seen (first few, for the UI). */
  sampleValues?: string[];
}

export interface ReportTotals {
  sections: number;
  items: number;
  comments: number;
  commentTypeBreakdown: Record<string, number>;
}

export interface ImportReport {
  totals: ReportTotals;
  columns: ColumnReportEntry[];
  /** Column names that were not in the canonical registry but had data. */
  unknownColumns: string[];
}

export type ParseHardError = {
  ok: false;
  error: {
    code: string;
    message: string;
    /** Actionable next step for the user, shown verbatim in the UI. */
    action: string;
  };
};

export type ImportResult =
  | {
      ok: true;
      template: ParsedTemplate;
      report: ImportReport;
      warnings: ImportWarning[];
    }
  | ParseHardError;
