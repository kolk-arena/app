'use client';

import { useEffect } from 'react';
import { QuickActionButton } from '@/components/ui/quick-action-button';

/**
 * Segment-level error boundary. Next.js App Router renders this INSIDE
 * the root `app/layout.tsx` `<html><body>` tree — so this file must
 * return a normal React subtree, NOT wrap its content in `<html>` or
 * `<body>` (those would produce nested document tags → React hydration
 * mismatch → blank page in the browser).
 *
 * The only file that should emit `<html>`/`<body>` is
 * `app/global-error.tsx`, which replaces the root layout when the
 * layout itself throws. See https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function SegmentError({
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
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center bg-slate-50 px-4 py-16 text-slate-950 sm:px-6 lg:px-8">
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
          <QuickActionButton type="button" onClick={reset} variant="primary" tone="sans" size="lg" width="stack">
            Retry
          </QuickActionButton>
          <QuickActionButton href="/" variant="secondary" tone="sans" size="lg" width="stack">
            Back home
          </QuickActionButton>
        </div>
      </section>
    </main>
  );
}
