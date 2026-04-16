import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center bg-slate-50 px-6 text-center text-slate-950">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">404</p>
      <h1 className="mt-4 text-4xl font-black tracking-tight">Page not found</h1>
      <p className="mt-4 max-w-md text-sm leading-7 text-slate-600">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Go home
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Leaderboard
        </Link>
      </div>
    </main>
  );
}
