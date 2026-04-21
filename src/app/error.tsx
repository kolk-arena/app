'use client';

import { useEffect } from 'react';
import { QuickActionButton } from '@/components/ui/quick-action-button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-950">
        <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
          <section className="w-full rounded-md border-2 border-rose-700 bg-rose-50 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-800">
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
              <QuickActionButton type="button" onClick={reset} variant="primary" tone="mono" size="lg" width="stack">
                Retry
              </QuickActionButton>
              <QuickActionButton href="/" variant="secondary" tone="mono" size="lg" width="stack">
                Back home
              </QuickActionButton>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
