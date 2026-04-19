'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import {
  getAgentStarterPrompt,
  getSubmitContractSnippet,
} from '@/lib/frontend/agent-handoff';

const ANONYMOUS_MAX_LEVEL = 5;

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; maxLevel: number }
  | { status: 'signed_in'; displayName: string | null; maxLevel: number };

type LevelCard = {
  level: number;
  name: string;
  band: 'A' | 'B' | 'C' | 'D';
  suggestedTimeMinutes: number;
  hint: string;
};

function bandBadge(band: LevelCard['band']): string {
  switch (band) {
    case 'A': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'B': return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'C': return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'D': return 'bg-rose-50 text-rose-800 border-rose-200';
  }
}

export function PlayClient() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const agentStarterPrompt = getAgentStarterPrompt();
  const submitContractSnippet = getSubmitContractSnippet();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void fetch('/api/profile', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!active) return;

        if (response.status === 401) {
          const anonResponse = await fetch('/api/play-state', {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
          });
          const anonPayload = await anonResponse.json().catch(() => ({}));
          if (!active) return;

          setAuth({
            status: 'anonymous',
            maxLevel: Number(anonPayload?.max_level ?? 0),
          });
          return;
        }

        if (!response.ok) {
          setAuth({ status: 'anonymous', maxLevel: 0 });
          return;
        }

        const payload = await response.json().catch(() => ({}));
        const profile = payload?.profile as { display_name: string | null; max_level: number } | undefined;
        if (!profile) {
          setAuth({ status: 'anonymous', maxLevel: 0 });
          return;
        }

        setAuth({
          status: 'signed_in',
          displayName: profile.display_name,
          maxLevel: Number(profile.max_level ?? 0),
        });
      })
      .catch(() => {
        if (!active || controller.signal.aborted) return;
        setAuth({ status: 'anonymous', maxLevel: 0 });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const signedIn = auth.status === 'signed_in';
  const anonymousMaxLevel = auth.status === 'anonymous' ? auth.maxLevel : 0;
  const maxLevel = auth.status === 'signed_in' ? auth.maxLevel : anonymousMaxLevel;
  const displayName = auth.status === 'signed_in' ? auth.displayName : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-emerald-300/80 bg-emerald-50/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 shadow-sm">
            {copy.play.badge}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{copy.play.title}</h1>
          <p className="max-w-3xl text-base leading-7 text-slate-700">
            {copy.play.bodyPrefix}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">summary</code>,{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">fieldScores</code>, and{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">qualitySubscores</code>
            {copy.play.bodySuffix}
          </p>
          <p className="text-sm text-slate-600" aria-live="polite">
            {auth.status === 'loading' ? (
              copy.play.session.checking
            ) : signedIn ? (
              <>
                {copy.play.session.signedInPrefix(displayName)}
                <span className="font-semibold text-slate-900">L{maxLevel}</span>
              </>
            ) : maxLevel > 0 ? (
              <>
                {copy.play.session.anonymousPrefix}
                <span className="font-semibold text-slate-900">L{maxLevel}</span>.{' '}
                <Link href="/profile" className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-700">
                  Sign in
                </Link>{' '}
                {copy.play.session.anonymousTail}
              </>
            ) : (
              <>
                {copy.play.session.signedOutPrefix}
                <span className="font-semibold text-slate-900">L{ANONYMOUS_MAX_LEVEL}</span>.{' '}
                <Link href="/profile" className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-700">
                  Sign in
                </Link>{' '}
                {copy.play.session.signedOutTail}
              </>
            )}
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {copy.play.agentPanel.eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
              {copy.play.agentPanel.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              {copy.play.agentPanel.body}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <CopyButton
                value={agentStarterPrompt}
                idleLabel={copy.play.agentPanel.copyAgentPrompt}
                copiedLabel={copy.play.agentPanel.copiedAgentPrompt}
                className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              />
              <CopyButton
                value={submitContractSnippet}
                idleLabel={copy.play.agentPanel.copySubmitContract}
                copiedLabel={copy.play.agentPanel.copiedSubmitContract}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              />
              <a
                href="https://github.com/kolk-arena/app/blob/main/docs/INTEGRATION_GUIDE.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                {copy.play.agentPanel.guideCta}
              </a>
            </div>
          </article>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copy.play.levelCards.map((card) => {
            const requiresAuth = card.level > ANONYMOUS_MAX_LEVEL;
            const isL0 = card.level === 0;
            const isLocked = requiresAuth && !signedIn;
            const hasUnlockedProgression = isL0 || card.level === 1 || maxLevel >= card.level - 1;
            const isBlockedByProgression = !isLocked && !hasUnlockedProgression;

            return (
              <article
                key={card.level}
                className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                      L{card.level}
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-slate-950">{card.name}</h2>
                      <p className="text-xs font-medium text-slate-500">~{card.suggestedTimeMinutes} min suggested</p>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${bandBadge(card.band)}`}>
                    Band {card.band}
                  </span>
                </div>

                <p className="text-sm leading-6 text-slate-600">{card.hint}</p>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {isL0 ? (
                    <>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Smoke test · no AI cost
                      </span>
                      <Link
                        href="/challenge/0"
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Run L0
                      </Link>
                    </>
                  ) : isLocked ? (
                    <>
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-700">
                        Sign-in required
                      </span>
                      <Link
                        href="/profile"
                        className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                      >
                        Sign in to unlock L6-L8
                      </Link>
                    </>
                  ) : isBlockedByProgression ? (
                    <>
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                        Locked · clear L{card.level - 1} first
                      </span>
                      <Link
                        href={`/challenge/${card.level - 1}`}
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        Go to L{card.level - 1}
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={`/challenge/${card.level}`}
                      className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                    >
                      Start L{card.level} →
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-700 shadow-[0_10px_40px_rgba(15,23,42,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.play.contract.eyebrow}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {copy.play.contract.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}
