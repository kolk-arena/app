'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Root-layout error boundary. Next.js renders this file in place of
 * `app/layout.tsx` WHEN THE LAYOUT ITSELF throws — i.e. before the
 * `<html>`/`<body>` tree exists. This is the ONLY error boundary that
 * must emit its own `<html>` and `<body>` tags (`app/error.tsx` is
 * segment-level and renders inside the root layout, so it must not).
 *
 * Kept intentionally minimal — no `copy`/`i18n` import, no custom
 * components, no data fetches. If `copy` or `QuickActionButton`
 * threw during the root layout render, importing them here would
 * cascade the same crash. Plain HTML + Tailwind utilities only.
 *
 * See https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-global-errors
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error] root layout crashed:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-950 antialiased">
        <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
          <section className="w-full rounded-xl border border-rose-200 bg-rose-50 p-8 shadow-sm">
            <p className="text-xs font-medium tracking-[0.14em] text-rose-700">
              Application error
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Something broke before the page finished loading
            </h1>
            <p className="mt-3 text-sm leading-7 text-rose-900">
              Retry once. If the same error returns, go back home and try again from a fresh page load.
            </p>
            {error.digest ? (
              <p className="mt-3 font-mono text-xs text-rose-900">
                Digest: {error.digest}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-800"
              >
                Retry
              </button>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
              >
                Back home
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
