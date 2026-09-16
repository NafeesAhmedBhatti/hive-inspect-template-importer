'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TemplateListItem } from '@/lib/services/templateService';

/** Dashboard table: real counts, rename inline, delete with confirm. */
export function TemplatesTable({ templates }: { templates: TemplateListItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<TemplateListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDuplicate(t: TemplateListItem) {
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${t.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = await jsonSafe(res);
        setError(json?.error?.message ?? `Duplicate failed (HTTP ${res.status})`);
        setBusyId(null);
        return;
      }
      setBusyId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplicate failed');
      setBusyId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleting) return;
    setBusyId(deleting.id);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${deleting.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await jsonSafe(res);
        setError(json?.error?.message ?? `Delete failed (HTTP ${res.status})`);
        setBusyId(null);
        return;
      }
      setDeleting(null);
      setBusyId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert" data-testid="dashboard-error">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="templates-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3 font-medium">Template</th>
              <th className="px-5 py-3 font-medium">Provenance</th>
              <th className="px-5 py-3 text-right font-medium">Sections</th>
              <th className="px-5 py-3 text-right font-medium">Items</th>
              <th className="px-5 py-3 text-right font-medium">Comments</th>
              <th className="px-5 py-3 font-medium">Updated</th>
              <th className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40">
                <td className="px-5 py-3">
                  <Link href={`/templates/${t.id}`} className="font-medium text-hive-700 hover:text-hive-800 hover:underline" data-testid={`template-link-${t.id}`}>
                    {t.name}
                  </Link>
                  {t.sourceFileName ? <p className="text-xs text-slate-400">{t.sourceFileName}</p> : null}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    t.isSynthetic
                      ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                      : 'bg-sky-50 text-sky-700 ring-sky-600/20'
                  }`}>
                    {t.isSynthetic ? 'synthetic sample' : t.source === 'spectora_html_text' ? 'Spectora import' : t.source}
                  </span>
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600">{t.counts.sections}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600">{t.counts.items}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-600">{t.counts.comments}</td>
                <td className="px-5 py-3 text-slate-500">{new Date(t.updatedAt).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/templates/${t.id}`}
                      className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => handleDuplicate(t)}
                      disabled={busyId === t.id}
                      className="rounded px-2 py-1 text-xs font-medium text-hive-600 hover:bg-hive-50 hover:text-hive-700 disabled:opacity-50"
                      data-testid={`template-duplicate-${t.id}`}
                    >
                      {busyId === t.id ? '…' : 'Duplicate'}
                    </button>
                    <button
                      onClick={() => setDeleting(t)}
                      disabled={busyId === t.id}
                      className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      data-testid={`template-delete-${t.id}`}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deleting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" data-testid="delete-confirm-modal">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Delete “{deleting.name}”?</h2>
            <p className="mt-2 text-sm text-slate-500">
              This permanently removes the template with all {deleting.counts.sections} sections,{' '}
              {deleting.counts.items} items and {deleting.counts.comments} comments. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleting(null)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                disabled={busyId === deleting.id || isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                data-testid="delete-confirm-button"
              >
                {busyId === deleting.id ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function jsonSafe(res: Response): Promise<{ error?: { message?: string } } | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
