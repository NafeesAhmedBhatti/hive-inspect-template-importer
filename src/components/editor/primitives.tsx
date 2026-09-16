'use client';

import { useEffect, useState } from 'react';

/** Badge colors for comment type + category across the app. */
export const TYPE_META: Record<string, { label: string; className: string }> = {
  info: { label: 'info', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  limit: { label: 'limit', className: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  defect: { label: 'defect', className: 'bg-red-50 text-red-700 ring-red-600/20' },
  unknown: { label: 'unknown', className: 'bg-purple-50 text-purple-700 ring-purple-600/20' },
};

export const CATEGORY_META: Record<string, { label: string; className: string }> = {
  '-1': { label: 'low', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  '0': { label: 'medium', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  '1': { label: 'high', className: 'bg-red-50 text-red-700 ring-red-600/20' },
};

export function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? TYPE_META.unknown;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.className}`} data-testid={`type-badge-${type}`}>
      {meta.label}
    </span>
  );
}

export function CategoryBadge({ category }: { category: number | null }) {
  if (category === null || category === undefined) return null;
  const meta = CATEGORY_META[String(category)] ?? { label: String(category), className: 'bg-slate-100 text-slate-600 ring-slate-500/20' };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.className}`} data-testid={`category-badge-${category}`}>
      {meta.label}
    </span>
  );
}

/**
 * Inline editable text. Persists on blur (and Ctrl/Cmd+Enter); shows a small
 * "saving/saved" state. `onSave` must throw on failure — the input then stays
 * in edit mode with the error shown.
 */
export function InlineEditable({
  value,
  onSave,
  className,
  inputClassName,
  multiline = false,
  placeholder,
  testId,
  disabled = false,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
  inputClassName?: string;
  multiline?: boolean;
  placeholder?: string;
  testId?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function commit() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setState('saving');
    setError(null);
    try {
      await onSave(draft);
      setState('saved');
      setEditing(false);
      setTimeout(() => setState('idle'), 1200);
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  if (!editing) {
    return (
      <span className={`group inline-flex items-baseline gap-1.5 ${className ?? ''}`}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setEditing(true)}
          className={`text-left ${disabled ? 'cursor-default' : 'cursor-text hover:bg-hive-50 hover:ring-1 hover:ring-hive-200'} rounded px-0.5 -mx-0.5`}
          data-testid={testId ? `${testId}-display` : undefined}
          title={disabled ? undefined : 'Click to edit'}
        >
          {value === '' ? <span className="text-slate-300 italic">{placeholder ?? 'empty'}</span> : value}
        </button>
        {state === 'saved' ? <span className="text-[11px] text-emerald-600">saved</span> : null}
        {state === 'saving' ? <span className="text-[11px] text-slate-400">saving…</span> : null}
        {state === 'error' ? <span className="text-[11px] text-red-600">{error}</span> : null}
      </span>
    );
  }

  const shared = {
    value: draft,
    autoFocus: true,
    'data-testid': testId ? `${testId}-input` : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(value);
        setEditing(false);
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !multiline)) {
        e.preventDefault();
        commit();
      }
    },
    className: inputClassName ?? 'w-full rounded border border-hive-400 px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-hive-500',
  };

  return (
    <span className="inline-flex w-full items-baseline gap-1.5">
      {multiline ? <textarea {...shared} rows={3} /> : <input type="text" {...shared} />}
      <span className="shrink-0 text-[11px] text-slate-400">{state === 'saving' ? 'saving…' : '⏎ to save'}</span>
    </span>
  );
}
