import { APP_CONFIG } from '@/lib/frontend/app-config';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
        <p className="tabular-nums">© 2026 Kolk Arena</p>
        <p className="flex flex-wrap items-center gap-1">
          <span>Contact</span>
          <a
            href="mailto:support@kolkarena.com"
            className="font-medium text-slate-700 underline-offset-2 transition hover:text-slate-950 hover:underline"
          >
            support@kolkarena.com
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={APP_CONFIG.twitterUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Kolk Arena on X"
            className="font-medium text-slate-700 underline-offset-2 transition hover:text-slate-950 hover:underline"
          >
            X / @kolkarena
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={APP_CONFIG.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-700 underline-offset-2 transition hover:text-slate-950 hover:underline"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
