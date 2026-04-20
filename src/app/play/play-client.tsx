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
    case 'A': return 'bg-emerald-50 text-emerald-800 border-emerald-700';
    case 'B': return 'bg-sky-50 text-sky-800 border-sky-700';
    case 'C': return 'bg-amber-50 text-amber-800 border-amber-700';
    case 'D': return 'bg-rose-50 text-rose-800 border-rose-700';
  }
}

function getRecommendedLevel(maxLevel: number, signedIn: boolean) {
  if (maxLevel <= 0) return 0;
  if (!signedIn && maxLevel >= ANONYMOUS_MAX_LEVEL) return null;
  if (signedIn && maxLevel >= 8) return null;
  return maxLevel + 1;
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
  const playUi = copy.play.cardUi;
  const recommendedLevel = getRecommendedLevel(maxLevel, signedIn);
  const summary = copy.play.summary;
  const actions = copy.play.actions;
  const levelCards = copy.play.levelCards;
  const l0Card = levelCards.find((card) => card.level === 0) ?? levelCards[0];
  const ladderCards = levelCards.filter((card) => card.level > 0);

  const primaryAction =
    auth.status === 'loading'
      ? null
      : recommendedLevel === 0
      ? { href: '/challenge/0', label: actions.runL0 }
      : recommendedLevel != null
      ? { href: `/challenge/${recommendedLevel}`, label: actions.continueToLevel(recommendedLevel) }
      : !signedIn
      ? { href: '/profile', label: actions.signInToCompete }
      : { href: '/leaderboard', label: actions.openLeaderboard };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-md border-2 border-emerald-700 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
            {copy.play.badge}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{copy.play.title}</h1>
          <p className="max-w-3xl text-base leading-7 text-slate-700">
            {copy.play.bodyPrefix}
            <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-950">summary</code>,{' '}
            <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-950">fieldScores</code>, and{' '}
            <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-950">qualitySubscores</code>
            {copy.play.bodySuffix}
          </p>
          <p className="text-sm text-slate-700" aria-live="polite">
            {auth.status === 'loading' ? (
              copy.play.session.checking
            ) : signedIn ? (
              <>
                {copy.play.session.signedInPrefix(displayName)}
                <span className="font-mono font-semibold text-slate-950">L{maxLevel}</span>
              </>
            ) : maxLevel > 0 ? (
              <>
                {copy.play.session.anonymousPrefix}
                <span className="font-mono font-semibold text-slate-950">L{maxLevel}</span>.{' '}
                <Link href="/profile" className="font-semibold text-emerald-800 underline decoration-emerald-700 underline-offset-2 hover:decoration-emerald-900">
                  {copy.play.session.signInCta}
                </Link>{' '}
                {copy.play.session.anonymousTail}
              </>
            ) : (
              <>
                {copy.play.session.signedOutPrefix}
                <span className="font-mono font-semibold text-slate-950">L{ANONYMOUS_MAX_LEVEL}</span>.{' '}
                <Link href="/profile" className="font-semibold text-emerald-800 underline decoration-emerald-700 underline-offset-2 hover:decoration-emerald-900">
                  {copy.play.session.signInCta}
                </Link>{' '}
                {copy.play.session.signedOutTail}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {primaryAction ? (
              <Link
                href={primaryAction.href}
                className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 font-mono text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
              >
                {primaryAction.label}
              </Link>
            ) : null}
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{summary.modeLabel}</p>
            <p className="mt-2 text-xl font-black tracking-tight text-slate-950">
              {auth.status === 'loading' ? summary.loadingValue : signedIn ? summary.signedInMode : summary.anonymousMode}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {signedIn ? summary.signedInUnlockHint : summary.anonymousUnlockHint}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{summary.progressLabel}</p>
            <p className="mt-2 text-xl font-black tracking-tight text-slate-950">
              {auth.status === 'loading' ? summary.loadingValue : summary.progressValue(maxLevel)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {signedIn ? summary.signedInUnlockHint : summary.anonymousUnlockHint}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{summary.nextLabel}</p>
            <p className="mt-2 text-xl font-black tracking-tight text-slate-950">
              {auth.status === 'loading'
                ? summary.loadingValue
                : recommendedLevel != null
                ? summary.nextStepStart(recommendedLevel)
                : signedIn
                ? summary.nextStepComplete
                : summary.nextStepSignIn}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {recommendedLevel === 0
                ? copy.challenge.deliveryRules.level0
                : recommendedLevel != null
                ? playUi.startLevel(recommendedLevel)
                : signedIn
                ? summary.signedInUnlockHint
                : summary.anonymousUnlockHint}
            </p>
          </article>
        </section>

        <section className="rounded-md border border-emerald-200 bg-emerald-50/40 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">Step 2 · Run L0</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
            {l0Card.name}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
            {l0Card.hint}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-md border border-emerald-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
              {playUi.smokeTestBadge}
            </span>
            <Link
              href="/challenge/0"
              className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 font-mono text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
            >
              {playUi.runLevel0}
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
            >
              {actions.openLeaderboard}
            </Link>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <article className="min-w-0 rounded-md border border-slate-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              {copy.play.agentPanel.eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
              {copy.play.agentPanel.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
              {copy.play.agentPanel.body}
            </p>
            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                {copy.play.agentPanel.directEyebrow}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Install <code className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[12px] text-slate-950">kolk_arena.md</code> first, then copy the starter prompt only when you need a fast one-off handoff.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="/kolk_arena.md"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
                >
                  Open kolk_arena.md
                </a>
                <CopyButton
                  value={agentStarterPrompt}
                  idleLabel={copy.play.agentPanel.copyAgentPrompt}
                  copiedLabel={copy.play.agentPanel.copiedAgentPrompt}
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-slate-950 px-4 py-2.5 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950 sm:w-auto"
                />
              </div>
            </div>
          </article>

          <aside className="min-w-0 rounded-md border border-slate-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              {copy.play.agentPanel.resourcesEyebrow}
            </p>
            <h3 className="mt-2 text-lg font-black tracking-tight text-slate-950">
              {copy.play.agentPanel.resourcesTitle}
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-700">
              {copy.play.agentPanel.resourcesBody}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="https://github.com/kolk-arena/app/blob/main/docs/INTEGRATION_GUIDE.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
              >
                {copy.play.agentPanel.guideCta}
              </a>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-700">
              {submitContractSnippet}
            </pre>
          </aside>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ladderCards.map((card) => {
            const requiresAuth = card.level > ANONYMOUS_MAX_LEVEL;
            const isLocked = requiresAuth && !signedIn;
            const hasUnlockedProgression = card.level === 1 || maxLevel >= card.level - 1;
            const isBlockedByProgression = !isLocked && !hasUnlockedProgression;
            const isCleared =
              maxLevel >= card.level;
            const isRecommended = recommendedLevel === card.level;

            return (
              <article
                key={card.level}
                className={`flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-5 sm:p-6 ${
                  isRecommended ? 'ring-2 ring-emerald-600 ring-offset-2' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-950 font-mono text-sm font-black text-white">
                      L{card.level}
                    </span>
                    <div>
                      <h2 className="text-base font-bold text-slate-950">{card.name}</h2>
                      <p className="font-mono text-xs font-medium text-slate-700">{playUi.suggestedTime(card.suggestedTimeMinutes)}</p>
                    </div>
                  </div>
                  <span className={`rounded-md border-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${bandBadge(card.band)}`}>
                    {playUi.bandLabel(card.band)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {isRecommended ? (
                    <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                      {playUi.recommendedBadge}
                    </span>
                  ) : null}
                  {isCleared ? (
                    <span className="inline-flex items-center rounded-md border-2 border-emerald-700 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                      {playUi.clearedBadge}
                    </span>
                  ) : !isLocked && !isBlockedByProgression ? (
                    <span className="inline-flex items-center rounded-md border-2 border-sky-700 bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-800">
                      {playUi.availableBadge}
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center rounded-md border-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      requiresAuth
                        ? 'border-rose-700 bg-rose-50 text-rose-800'
                        : 'border-slate-950 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {requiresAuth ? playUi.competitiveBadge : playUi.practiceBadge}
                  </span>
                </div>

                <p className="text-sm leading-6 text-slate-700">{card.hint}</p>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {isLocked ? (
                    <>
                      <span className="inline-flex items-center rounded-md border-2 border-rose-700 bg-rose-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-800">
                        {playUi.signInRequiredBadge}
                      </span>
                      <Link
                        href="/profile"
                        className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-4 py-2 font-mono text-xs font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
                      >
                        {playUi.signInUnlockLevels}
                      </Link>
                    </>
                  ) : isBlockedByProgression ? (
                    <>
                      <span className="inline-flex items-center rounded-md border-2 border-amber-700 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                        {playUi.progressionLocked(card.level - 1)}
                      </span>
                      <Link
                        href={`/challenge/${card.level - 1}`}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 font-mono text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
                      >
                        {playUi.goToLevel(card.level - 1)}
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={`/challenge/${card.level}`}
                      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-4 py-2 font-mono text-xs font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
                    >
                      {playUi.startLevel(card.level)}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-md border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-700">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{copy.play.contract.eyebrow}</p>
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
