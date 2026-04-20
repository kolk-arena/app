'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';

const links = [
  { href: '/', label: copy.nav.home },
  { href: '/play', label: copy.nav.play },
  { href: '/leaderboard', label: copy.nav.leaderboard },
  { href: '/profile', label: copy.nav.profile },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="font-mono text-base font-bold tracking-tight text-slate-950">
          {APP_CONFIG.name}
        </Link>

        <div className="flex items-center gap-1">
          {links.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-none px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] transition ${
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-700 hover:bg-slate-950 hover:text-white'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <a
            href={APP_CONFIG.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 rounded-none px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-700 transition hover:bg-slate-950 hover:text-white"
          >
            {copy.nav.github}
          </a>
        </div>
      </nav>
    </header>
  );
}
