import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hive Inspect · Template Importer',
  description:
    'Import Spectora HTML-text template exports into Hive Inspect — faithful structure, editing, and independent duplication.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-hive-500 text-sm font-bold text-white">
                  H
                </span>
                <span className="text-sm font-semibold tracking-tight text-slate-900">
                  Hive Inspect{' '}
                  <span className="font-normal text-slate-400">· Template Importer</span>
                </span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link
                  href="/"
                  className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Templates
                </Link>
                <Link
                  href="/import"
                  className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Import
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-6 py-3 text-xs text-slate-400">
              Hive Inspect — Template Importer · Spectora HTML-text export pipeline
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
