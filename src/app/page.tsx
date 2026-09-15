import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Template Importer</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Scaffold placeholder — the template dashboard arrives in Phase 4.{' '}
        <Link href="/import" className="font-medium text-amber-700 underline underline-offset-2">
          Import a Spectora export
        </Link>{' '}
        once the parser lands.
      </p>
    </div>
  );
}
