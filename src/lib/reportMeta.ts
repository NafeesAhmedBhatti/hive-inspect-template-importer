import type { ImportReport, ImportWarning } from '@/lib/spectora/types';

/** Human labels + tooltips for each preservation-report column status. */
export const COLUMN_STATUS_META: Record<
  string,
  { label: string; className: string; hint: string }
> = {
  imported_first_class: {
    label: 'Imported (editable)',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    hint: 'Mapped to a first-class, editable field in Hive Inspect.',
  },
  stored_verbatim: {
    label: 'Stored verbatim',
    className: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    hint: 'Not an editable field here, but the data is preserved on every comment and shown in the editor.',
  },
  absent_in_source: {
    label: 'Absent in source',
    className: 'bg-slate-100 text-slate-500 ring-slate-500/20',
    hint: 'This column was not present (or entirely empty) in the export — nothing was lost.',
  },
  rich_content_detected: {
    label: 'Rich content',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    hint: 'Cells contain HTML formatting — preserved verbatim; rendering is sanitized.',
  },
  unknown_column: {
    label: 'Unknown column',
    className: 'bg-purple-50 text-purple-700 ring-purple-600/20',
    hint: 'Not part of the documented export format — data preserved verbatim anyway.',
  },
};

export const WARNING_LEVEL_META: Record<ImportWarning['level'], { label: string; className: string }> = {
  info: { label: 'info', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  warning: { label: 'warning', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  error: { label: 'error', className: 'bg-red-50 text-red-700 ring-red-600/20' },
};

export function summarizeReport(report: ImportReport) {
  const firstClass = report.columns.filter((c) => c.status === 'imported_first_class');
  const verbatim = report.columns.filter((c) => c.status === 'stored_verbatim');
  const absent = report.columns.filter((c) => c.status === 'absent_in_source');
  const rich = report.columns.filter((c) => c.status === 'rich_content_detected');
  const unknown = report.columns.filter((c) => c.status === 'unknown_column');
  return { firstClass, verbatim, absent, rich, unknown };
}
