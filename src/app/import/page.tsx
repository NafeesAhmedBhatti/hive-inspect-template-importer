'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import type { ImportReport, ImportResult, ImportWarning } from '@/lib/spectora/types';
import { COLUMN_STATUS_META, summarizeReport, WARNING_LEVEL_META } from '@/lib/reportMeta';

/**
 * Import preview flow (Phase 3): upload → server-side parse (NO persistence)
 * → counts + preservation report + warnings → confirm hands the parsed IR to
 * the commit step (Phase 3b). Canceling here leaves the database untouched.
 */

type Stage = 'idle' | 'uploading' | 'preview' | 'committing' | 'committed';

interface CommittedTemplate {
  id: string;
  name: string;
}

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>('idle');
  const [fileName, setFileName] = useState<string>('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<{ message: string; action: string } | null>(null);
  const [committed, setCommitted] = useState<CommittedTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setStage('uploading');
    setError(null);
    setResult(null);
    setCommitted(null);
    setFileName(file.name);
    setTemplateName(file.name.replace(/\.(xlsx|xls)$/i, ''));

    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/import/preview', { method: 'POST', body: form });
      const json = (await res.json()) as ImportResult;
      if (!res.ok || !json.ok) {
        const err = json.ok === false ? json.error : { message: `Server error ${res.status}`, action: 'Try again; if it persists, re-export the file.' };
        setError(err);
        setStage('idle');
        return;
      }
      setResult(json);
      setStage('preview');
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : 'Upload failed',
        action: 'Check your connection and try again.',
      });
      setStage('idle');
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!result || !result.ok) return;
    setStage('committing');
    setError(null);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: result.template,
          warnings: result.warnings,
          report: result.report,
          templateName: templateName.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError({
          message: json?.error?.message ?? `Import failed (HTTP ${res.status})`,
          action: json?.error?.action ?? 'Nothing was saved — try the import again.',
        });
        setStage('preview');
        return;
      }
      setCommitted({ id: json.template.id, name: json.template.name });
      setStage('committed');
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : 'Import failed',
        action: 'Nothing was saved — try the import again.',
      });
      setStage('preview');
    }
  }, [result, templateName]);

  const reset = useCallback(() => {
    setStage('idle');
    setResult(null);
    setError(null);
    setCommitted(null);
    setFileName('');
    setTemplateName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Import a Spectora template</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload the <span className="font-medium text-slate-700">Export to spreadsheet → Export HTML Text</span> file
          (.xlsx). You will see a full preview and preservation report{' '}
          <span className="font-medium text-slate-700">before</span> anything is saved.
        </p>
      </div>

      {stage === 'idle' || stage === 'uploading' ? (
        <UploadDropzone onFile={handleUpload} busy={stage === 'uploading'} fileName={fileName} inputRef={fileInputRef} />
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert" data-testid="import-error">
          <p className="text-sm font-semibold text-red-800">{error.message}</p>
          <p className="mt-1 text-sm text-red-700">{error.action}</p>
          <button onClick={reset} className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
            Start over
          </button>
        </div>
      ) : null}

      {stage === 'preview' && result && result.ok ? (
        <PreviewResult
          result={result}
          templateName={templateName}
          onTemplateName={setTemplateName}
          onConfirm={handleConfirm}
          onCancel={reset}
          committing={false}
        />
      ) : null}

      {stage === 'committed' && committed ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center" data-testid="import-committed">
          <p className="text-sm font-semibold text-emerald-800">Template imported.</p>
          <p className="mt-1 text-sm text-emerald-700">“{committed.name}” is now in your template library.</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link
              href={`/templates/${committed.id}`}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open template
            </Link>
            <button onClick={reset} className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100">
              Import another
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UploadDropzone({
  onFile,
  busy,
  fileName,
  inputRef,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  fileName: string;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition ${
        busy ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-white hover:border-hive-400 hover:bg-hive-50/40'
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) onFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="sr-only"
        data-testid="import-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
        disabled={busy}
      />
      {busy ? (
        <>
          <span className="text-sm font-medium text-amber-800">Parsing “{fileName}”…</span>
          <span className="mt-1 text-xs text-amber-600">Validating structure and building the preservation report.</span>
        </>
      ) : (
        <>
          <span className="text-sm font-medium text-slate-700">Drop the .xlsx here, or click to choose a file</span>
          <span className="mt-1 text-xs text-slate-400">Spectora HTML-text export · up to 25 MB</span>
        </>
      )}
    </label>
  );
}

function PreviewResult({
  result,
  templateName,
  onTemplateName,
  onConfirm,
  onCancel,
  committing,
}: {
  result: Extract<ImportResult, { ok: true }>;
  templateName: string;
  onTemplateName: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  committing: boolean;
}) {
  const { template, report, warnings } = result;
  const errorCount = warnings.filter((w) => w.level === 'error').length;
  const warningCount = warnings.filter((w) => w.level === 'warning').length;

  return (
    <div className="space-y-5" data-testid="import-preview">
      {/* Totals */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Preview — nothing saved yet</p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-slate-900">{template.name}</h2>
            <p className="text-xs text-slate-400">from {template.sourceFileName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              data-testid="import-cancel"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={committing}
              className="rounded-md bg-hive-600 px-4 py-2 text-sm font-semibold text-white hover:bg-hive-700 disabled:opacity-60"
              data-testid="import-confirm"
            >
              {committing ? 'Importing…' : 'Import this template'}
            </button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3" data-testid="import-totals">
          <Total label="Sections" value={report.totals.sections} />
          <Total label="Items" value={report.totals.items} />
          <Total label="Comments" value={report.totals.comments} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(report.totals.commentTypeBreakdown).map(([type, n]) => (
            <span key={type} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {type}: {n}
            </span>
          ))}
        </div>
      </div>

      {/* Template name override */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label htmlFor="template-name" className="block text-sm font-medium text-slate-700">
          Template name
        </label>
        <input
          id="template-name"
          type="text"
          value={templateName}
          onChange={(e) => onTemplateName(e.target.value)}
          className="mt-1 block w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-hive-500 focus:outline-none focus:ring-1 focus:ring-hive-500"
        />
      </div>

      <PreservationReport report={report} />

      <WarningsPanel warnings={warnings} errorCount={errorCount} warningCount={warningCount} />
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-center">
      <dd className="text-2xl font-semibold text-slate-900">{value}</dd>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
    </div>
  );
}

function PreservationReport({ report }: { report: ImportReport }) {
  const summary = summarizeReport(report);
  return (
    <div className="rounded-xl border border-slate-200 bg-white" data-testid="preservation-report">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Preservation report</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          What happened to every column in the export. Absent columns were <em>not in the file</em> — nothing was lost.
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-5 py-2 font-medium">Column</th>
            <th className="px-5 py-2 font-medium">Status</th>
            <th className="px-5 py-2 text-right font-medium">Populated rows</th>
            <th className="px-5 py-2 text-right font-medium">Rich content</th>
          </tr>
        </thead>
        <tbody>
          {report.columns.map((col) => {
            const meta = COLUMN_STATUS_META[col.status];
            return (
              <tr key={col.column} className="border-b border-slate-50 last:border-0" title={meta.hint}>
                <td className="px-5 py-2 font-medium text-slate-800">
                  {col.column}
                  {col.sampleValues?.length ? (
                    <span className="ml-2 text-xs font-normal text-slate-400">e.g. {col.sampleValues.join(', ')}</span>
                  ) : null}
                </td>
                <td className="px-5 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.className}`}>
                    {meta.label}
                  </span>
                </td>
                <td className="px-5 py-2 text-right text-slate-600">{col.status === 'absent_in_source' ? '—' : col.populatedRows}</td>
                <td className="px-5 py-2 text-right text-slate-600">{col.richContentRows > 0 ? col.richContentRows : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-slate-100 px-5 py-3">
        <p className="text-xs text-slate-500">
          {summary.firstClass.length} editable · {summary.verbatim.length} stored verbatim · {summary.absent.length} absent in
          source{summary.unknown.length > 0 ? ` · ${summary.unknown.length} unknown (data kept)` : ''}
        </p>
      </div>
    </div>
  );
}

function WarningsPanel({
  warnings,
  errorCount,
  warningCount,
}: {
  warnings: ImportWarning[];
  errorCount: number;
  warningCount: number;
}) {
  const [open, setOpen] = useState(true);
  if (warnings.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-700" data-testid="warnings-panel">
        No warnings — the export parsed cleanly.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white" data-testid="warnings-panel">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="text-sm font-semibold text-slate-900">
          Warnings &amp; notes{' '}
          <span className="ml-1 font-normal text-slate-400">
            ({errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}, ` : ''}
            {warningCount} warning{warningCount === 1 ? '' : 's'}, {warnings.length - errorCount - warningCount} notes)
          </span>
        </span>
        <span className="text-xs text-slate-400">{open ? 'hide' : 'show'}</span>
      </button>
      {open ? (
        <ul className="divide-y divide-slate-50 border-t border-slate-100">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-2.5">
              <span className={`mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${WARNING_LEVEL_META[w.level].className}`}>
                {WARNING_LEVEL_META[w.level].label}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-700">{w.message}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-300">{w.code}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
