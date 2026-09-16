import Link from 'next/link';
import { listTemplates } from '@/lib/services/templateService';
import { TemplatesTable } from '@/components/dashboard/TemplatesTable';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  let templates: Awaited<ReturnType<typeof listTemplates>> = [];
  let dbError: string | null = null;
  try {
    templates = await listTemplates();
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'Database unavailable';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your imported template library. Open a template to inspect or edit its full structure.
          </p>
        </div>
        <Link
          href="/import"
          className="rounded-md bg-hive-600 px-4 py-2 text-sm font-semibold text-white hover:bg-hive-700"
          data-testid="dashboard-import-cta"
        >
          Import template
        </Link>
      </div>

      {dbError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          Could not load templates: {dbError}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center" data-testid="dashboard-empty">
          <p className="text-sm font-medium text-slate-700">No templates yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Import a Spectora HTML-text export to build your library.
          </p>
          <Link
            href="/import"
            className="mt-4 inline-block rounded-md border border-hive-300 bg-white px-4 py-2 text-sm font-medium text-hive-700 hover:bg-hive-50"
          >
            Import your first template
          </Link>
        </div>
      ) : (
        <TemplatesTable templates={templates} />
      )}
    </div>
  );
}
