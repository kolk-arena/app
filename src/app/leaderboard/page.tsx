import type { Metadata } from 'next';
import { Suspense } from 'react';
import { copy } from '@/i18n';
import { LeaderboardClient } from './leaderboard-client';

export const metadata: Metadata = {
  title: copy.nav.leaderboard,
  description: copy.leaderboard.metaDescription,
};

export default function LeaderboardPage() {
  return (
    <Suspense
      fallback={(
        <main className="min-h-screen bg-slate-50 text-slate-950">
          <section className="mx-auto flex max-w-[112rem] flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-sm text-slate-500 shadow-sm sm:px-6">
              {copy.leaderboard.loading}
            </div>
          </section>
        </main>
      )}
    >
      <LeaderboardClient />
    </Suspense>
  );
}
