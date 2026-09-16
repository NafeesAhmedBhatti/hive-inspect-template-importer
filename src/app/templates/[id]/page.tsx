import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTemplateTree } from '@/lib/services/templateService';
import { TemplateEditor } from '@/components/editor/TemplateEditor';

export const dynamic = 'force-dynamic';

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
  const tree = await getTemplateTree(params.id);
  if (!tree) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Link href="/templates" className="hover:text-slate-600">
              Templates
            </Link>
            <span>/</span>
            <span className="truncate text-slate-500">{tree.name}</span>
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-900" data-testid="template-title">
            {tree.name}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            {tree.sourceFileName ? `from ${tree.sourceFileName} · ` : ''}
            {tree.isSynthetic ? 'synthetic sample data' : 'imported from Spectora'} · updated{' '}
            {new Date(tree.updatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <TemplateEditor tree={tree} />

      <p className="text-xs text-slate-400">
        Comment text is stored exactly as exported (raw HTML preserved) and rendered through a strict allowlist
        sanitizer — scripts, styles and iframes can never execute.
      </p>
    </div>
  );
}
