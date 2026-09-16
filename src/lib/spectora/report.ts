import { CANONICAL_COLUMNS, isFirstClassColumn } from './columns';
import { containsRichContent } from './sanitize';
import type {
  ColumnReportEntry,
  ColumnStatus,
  ImportReport,
  ReportTotals,
} from './types';
import type { RawWorkbook } from './readWorkbook';
import type { ParsedTemplate } from './types';

/**
 * Preservation report builder — every count derives ONLY from the actual
 * parse results. Missing source data is reported as `absent_in_source`,
 * never as "lost". Present-but-not-first-class data is `stored_verbatim`.
 */
export function buildReport(workbook: RawWorkbook, template: ParsedTemplate): ImportReport {
  const totals: ReportTotals = {
    sections: template.sections.length,
    items: template.sections.reduce((n, s) => n + s.items.length, 0),
    comments: template.sections.reduce(
      (n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0),
      0
    ),
    commentTypeBreakdown: {},
  };
  for (const section of template.sections) {
    for (const item of section.items) {
      for (const comment of item.comments) {
        totals.commentTypeBreakdown[comment.type] = (totals.commentTypeBreakdown[comment.type] ?? 0) + 1;
      }
    }
  }

  const columns: ColumnReportEntry[] = [];

  for (const column of CANONICAL_COLUMNS) {
    const values = workbook.rows.map((r) => r.cells.get(column) ?? '');
    const populatedRows = values.filter((v) => v !== '').length;

    let status: ColumnStatus;
    let richContentRows = 0;
    if (isFirstClassColumn(column)) {
      if (column === 'Comment Text') {
        richContentRows = values.filter((v) => v !== '' && containsRichContent(v)).length;
        status = richContentRows > 0 ? 'rich_content_detected' : 'imported_first_class';
      } else {
        status = 'imported_first_class';
      }
    } else {
      status = populatedRows > 0 ? 'stored_verbatim' : 'absent_in_source';
    }

    columns.push({ column, status, populatedRows, richContentRows });
  }

  const unknownColumns: string[] = [];
  for (const header of workbook.unknownHeaders) {
    const key = `__unknown__:${header.raw}`;
    const values = workbook.rows
      .map((r) => r.cells.get(key) ?? '')
      .filter((v) => v !== '');
    if (values.length === 0) continue; // an unknown header with no data is structural noise
    unknownColumns.push(header.raw);
    columns.push({
      column: header.raw,
      status: 'unknown_column',
      populatedRows: values.length,
      richContentRows: values.filter((v) => containsRichContent(v)).length,
      sampleValues: [...new Set(values)].slice(0, 3),
    });
  }

  return { totals, columns, unknownColumns };
}
