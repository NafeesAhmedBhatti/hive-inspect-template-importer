'use client';

import { useMemo, useState } from 'react';
import type { TemplateTree } from '@/lib/services/templateService';
import { InlineEditable, TypeBadge, CategoryBadge } from './primitives';

/**
 * Structured template editor: indented section → item → comment tree with
 * inline edits persisted per-field via PATCH endpoints. Extra (verbatim)
 * Spectora columns render read-only beneath each comment.
 */
export function TemplateEditor({ tree }: { tree: TemplateTree }) {
  const [sections, setSections] = useState(tree.sections);
  const [extraOpen, setExtraOpen] = useState<Record<string, boolean>>({});

  async function save(endpoint: string, body: unknown) {
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error?.message ?? `Save failed (HTTP ${res.status})`);
    }
  }

  const totals = useMemo(
    () => ({
      sections: sections.length,
      items: sections.reduce((n, s) => n + s.items.length, 0),
      comments: sections.reduce((n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0), 0),
    }),
    [sections]
  );

  return (
    <div className="space-y-4" data-testid="template-editor">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Structure</p>
        <p className="mt-1 text-sm text-slate-600">
          {totals.sections} sections · {totals.items} items · {totals.comments} comments — click any name to edit it.
          Changes save as you leave the field.
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid={`section-${section.id}`}>
          <header className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
            <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Section</span>
            <InlineEditable
              value={section.name}
              testId={`section-name-${section.id}`}
              className="text-sm font-semibold text-slate-900"
              inputClassName="w-full max-w-xl rounded border border-hive-400 px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-hive-500"
              onSave={async (next) => {
                await save(`/api/sections/${section.id}`, { name: next });
                setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, name: next.trim() } : s)));
              }}
            />
          </header>

          <div className="divide-y divide-slate-50">
            {section.items.map((item) => (
              <div key={item.id} className="px-5 py-3">
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded bg-hive-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-hive-600">Item</span>
                  <InlineEditable
                    value={item.name}
                    testId={`item-name-${item.id}`}
                    className="text-sm font-medium text-slate-800"
                    inputClassName="w-full max-w-xl rounded border border-hive-400 px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-hive-500"
                    onSave={async (next) => {
                      await save(`/api/items/${item.id}`, { name: next });
                      setSections((prev) =>
                        prev.map((s) =>
                          s.id === section.id
                            ? { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, name: next.trim() } : i)) }
                            : s
                        )
                      );
                    }}
                  />
                </div>

                {item.comments.length === 0 ? (
                  <p className="ml-8 mt-1.5 text-xs italic text-slate-300">No comments under this item.</p>
                ) : (
                  <ul className="ml-8 mt-2 space-y-2">
                    {item.comments.map((comment) => {
                      const extraEntries = Object.entries(comment.extra ?? {});
                      return (
                        <li key={comment.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5" data-testid={`comment-${comment.id}`}>
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <InlineEditable
                              value={comment.name ?? ''}
                              placeholder="(no name)"
                              testId={`comment-name-${comment.id}`}
                              className="text-sm font-medium text-slate-800"
                              inputClassName="w-full max-w-md rounded border border-hive-400 px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-hive-500"
                              onSave={async (next) => {
                                await save(`/api/comments/${comment.id}`, { name: next === '' ? null : next });
                                setSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id
                                      ? {
                                          ...s,
                                          items: s.items.map((i) =>
                                            i.id === item.id
                                              ? { ...i, comments: i.comments.map((c) => (c.id === comment.id ? { ...c, name: next === '' ? null : next } : c)) }
                                              : i
                                          ),
                                        }
                                      : s
                                  )
                                );
                              }}
                            />
                            <TypeBadge type={comment.commentType} />
                            <CategoryBadge category={comment.category} />
                          </div>

                          <div className="mt-1.5">
                            <InlineEditable
                              value={comment.text}
                              multiline
                              placeholder="(no text)"
                              testId={`comment-text-${comment.id}`}
                              className="block text-sm text-slate-600"
                              inputClassName="w-full rounded border border-hive-400 px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-hive-500"
                              onSave={async (next) => {
                                await save(`/api/comments/${comment.id}`, { text: next });
                                setSections((prev) =>
                                  prev.map((s) =>
                                    s.id === section.id
                                      ? {
                                          ...s,
                                          items: s.items.map((i) =>
                                            i.id === item.id
                                              ? { ...i, comments: i.comments.map((c) => (c.id === comment.id ? { ...c, text: next } : c)) }
                                              : i
                                          ),
                                        }
                                      : s
                                  )
                                );
                              }}
                            />
                          </div>

                          {extraEntries.length > 0 ? (
                            <div className="mt-2">
                              <button
                                onClick={() => setExtraOpen((prev) => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                                className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
                                data-testid={`extra-toggle-${comment.id}`}
                              >
                                {extraOpen[comment.id] ? '▾' : '▸'} {extraEntries.length} verbatim column{extraEntries.length > 1 ? 's' : ''}
                              </button>
                              {extraOpen[comment.id] ? (
                                <dl className="mt-1.5 space-y-1 rounded border border-slate-100 bg-white px-3 py-2" data-testid={`extra-${comment.id}`}>
                                  {extraEntries.map(([k, v]) => (
                                    <div key={k} className="flex gap-2 text-xs">
                                      <dt className="w-44 shrink-0 font-medium text-slate-400">{k}</dt>
                                      <dd className="min-w-0 break-words text-slate-600">{v}</dd>
                                    </div>
                                  ))}
                                </dl>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
