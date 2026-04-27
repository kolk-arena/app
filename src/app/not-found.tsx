import Link from 'next/link';
import { copy } from '@/i18n';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-16 text-slate-950 sm:px-6 lg:px-8">
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm sm:px-8">
        <p className="text-xs font-medium tracking-[0.14em] text-slate-500">{copy.notFound.code}</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">{copy.notFound.title}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-700">
          {copy.notFound.body}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="action-button action-button-slate action-button-lg focus-visible:outline-none"
          >
            {copy.notFound.goHome}
          </Link>
          <Link
            href="/leaderboard"
            className="action-button action-button-secondary action-button-lg focus-visible:outline-none"
          >
            {copy.notFound.leaderboard}
          </Link>
        </div>
      </section>
    </main>
  );
}
