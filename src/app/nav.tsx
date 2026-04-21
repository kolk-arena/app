'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-base font-semibold tracking-tight text-slate-950">
            {APP_CONFIG.name}
          </Link>

          <div className="flex items-center gap-2">
            <a
              href={APP_CONFIG.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 sm:inline-flex"
            >
              {copy.nav.github}
            </a>

            <button
              type="button"
              onClick={() => setMobileOpen((current) => !current)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-site-nav"
              className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 sm:hidden"
            >
              {mobileOpen ? copy.nav.menuClose : copy.nav.menuOpen}
            </button>
          </div>
        </div>

        <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          {links.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 ${
                  active
                    ? 'bg-slate-950 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {mobileOpen ? (
          <div
            id="mobile-site-nav"
            className="sm:hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="grid grid-cols-2 gap-2">
              {links.map(({ href, label }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 ${
                      active
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <a
                href={APP_CONFIG.githubUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMobileOpen(false)}
                className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              >
                {copy.nav.github}
              </a>
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
