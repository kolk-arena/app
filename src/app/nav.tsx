'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home' },
  { href: '/play', label: 'Play' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/profile', label: 'Profile' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="text-base font-bold tracking-tight text-slate-950">
          Kolk Arena
        </Link>

        <div className="flex items-center gap-1">
          {links.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-slate-100 text-slate-950'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <a
            href="https://github.com/kolk-arena/app"
            target="_blank"
            rel="noreferrer"
            className="ml-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
