import Link from 'next/link';
import { copy } from '@/i18n';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center bg-slate-50 px-6 text-center text-slate-950">
      <p className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">{copy.notFound.code}</p>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">{copy.notFound.title}</h1>
      <p className="mt-4 max-w-md text-sm leading-7 text-slate-700">
        {copy.notFound.body}
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-md border-2 border-slate-950 bg-slate-950 px-5 py-3 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
        >
          {copy.notFound.goHome}
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-md border-2 border-slate-950 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
        >
          {copy.notFound.leaderboard}
        </Link>
      </div>
    </main>
  );
}
