'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
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
          <div className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {copy.play.badge}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">{copy.play.title}</h1>
          <p className="max-w-3xl text-base leading-7 text-slate-700">
            {copy.play.bodyPrefix}
            <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-950">summary</code>
            {copy.play.bodyListSeparator}
            <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-950">fieldScores</code>
            {copy.play.bodyListFinalConjunction}
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
                <Link href="/profile" className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">
                  {copy.play.session.signInCta}
                </Link>{' '}
                {copy.play.session.anonymousTail}
              </>
            ) : (
              <>
                {copy.play.session.signedOutPrefix}
                <span className="font-mono font-semibold text-slate-950">L{ANONYMOUS_MAX_LEVEL}</span>.{' '}
                <Link href="/profile" className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">
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
                className="memory-accent-button inline-flex min-h-11 w-full items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 sm:w-auto"
              >
                {primaryAction.label}
              </Link>
            ) : null}
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">{summary.modeLabel}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {auth.status === 'loading' ? summary.loadingValue : signedIn ? summary.signedInMode : summary.anonymousMode}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {signedIn ? summary.signedInUnlockHint : summary.anonymousUnlockHint}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">{summary.progressLabel}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {auth.status === 'loading' ? summary.loadingValue : summary.progressValue(maxLevel)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {signedIn ? summary.signedInUnlockHint : summary.anonymousUnlockHint}
            </p>
          </article>
          <article className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">{summary.nextLabel}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
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

        {maxLevel === 0 ? (
          <section className="rounded-md border border-slate-200 bg-white p-6">
            <p className="text-xs font-medium text-slate-500">{copy.play.l0SpotlightEyebrow}</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
              {l0Card.name}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
              {l0Card.hint}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700">
                {playUi.smokeTestBadge}
              </span>
              <Link
                href="/challenge/0"
                className="memory-accent-button inline-flex min-h-11 w-full items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 sm:w-auto"
              >
                {playUi.runLevel0}
              </Link>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {summary.nextStepStart(0)}. {copy.play.contract.bullets[0]}
            </p>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ladderCards.map((card) => {
            const requiresAuth = card.level > ANONYMOUS_MAX_LEVEL;
            const isLocked = requiresAuth && !signedIn;
            const hasUnlockedProgression = card.level === 1 || maxLevel >= card.level - 1;
            const isBlockedByProgression = !isLocked && !hasUnlockedProgression;
            const isCleared =
              maxLevel >= card.level;
            const isRecommended = recommendedLevel === card.level;
            const stateBadge =
              isLocked
                ? { label: playUi.signInRequiredBadge, className: 'border border-rose-200 bg-rose-50 text-rose-700' }
                : isBlockedByProgression
                ? { label: playUi.progressionLocked(card.level - 1), className: 'border border-amber-200 bg-amber-50 text-amber-700' }
                : isRecommended
                ? { label: playUi.recommendedBadge, className: 'border border-slate-950 bg-slate-950 text-white' }
                : isCleared
                ? { label: playUi.clearedBadge, className: 'border border-emerald-200 bg-emerald-50 text-emerald-700' }
                : null;
            const tierLabel = requiresAuth ? playUi.competitiveBadge : playUi.practiceBadge;

            return (
              <article
                key={card.level}
                className={`flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-5 sm:p-6 ${
                  isRecommended ? 'ring-2 ring-slate-950 ring-offset-2' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-mono text-sm font-semibold text-slate-700">
                  L{card.level}
                </span>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-950">{card.name}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {playUi.bandLabel(card.band)} · {playUi.suggestedTime(card.suggestedTimeMinutes)} · {tierLabel}
                      </p>
                    </div>
                  </div>
                  {stateBadge ? (
                    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium ${stateBadge.className}`}>
                      {stateBadge.label}
                    </span>
                  ) : null}
                </div>

                <p className="text-sm leading-6 text-slate-700">{card.hint}</p>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {isLocked ? (
                    <Link
                      href="/profile"
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 sm:w-auto"
                    >
                      {playUi.signInUnlockLevels}
                    </Link>
                  ) : isBlockedByProgression ? (
                    <Link
                      href={`/challenge/${card.level - 1}`}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 sm:w-auto"
                    >
                      {playUi.goToLevel(card.level - 1)}
                    </Link>
                  ) : (
                    <Link
                      href={`/challenge/${card.level}`}
                      className={`inline-flex min-h-11 w-full items-center justify-center rounded-md border px-4 py-2 text-sm transition-colors duration-150 sm:w-auto ${
                        isRecommended
                          ? 'memory-accent-button font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2'
                          : 'border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                      }`}
                    >
                      {playUi.startLevel(card.level)}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <details className="rounded-md border border-slate-200 bg-white">
          <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-slate-900">
            {copy.play.agentPanel.title}
          </summary>
          <div className="border-t border-slate-200 px-6 py-6">
            <p className="max-w-3xl text-sm leading-7 text-slate-700">
              {copy.play.agentPanel.body}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <CopyButton
                value={agentStarterPrompt}
                idleLabel={copy.play.agentPanel.copyAgentPrompt}
                copiedLabel={copy.play.agentPanel.copiedAgentPrompt}
                className="memory-accent-button inline-flex w-full items-center justify-center rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 sm:w-auto"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <a
                href="/kolk_arena.md"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors duration-150 hover:text-slate-950 hover:decoration-slate-500"
              >
                {copy.play.openSkillLink}
              </a>
              <a
                href="https://github.com/kolk-arena/app/blob/main/docs/INTEGRATION_GUIDE.md"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors duration-150 hover:text-slate-950 hover:decoration-slate-500"
              >
                {copy.play.agentPanel.guideCta}
              </a>
            </div>
            <CodeBlock
              code={submitContractSnippet}
              language="bash"
              tone="light"
              title="Submit contract"
              className="mt-4"
            />
          </div>
        </details>

        <aside className="rounded-md border border-slate-200 bg-white p-6 text-sm leading-7 text-slate-700">
          <p className="text-xs font-medium text-slate-500">{copy.play.contract.eyebrow}</p>
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
