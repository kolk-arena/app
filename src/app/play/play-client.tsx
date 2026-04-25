'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import {
  getAgentStarterPrompt,
  getSubmitContractSnippet,
} from '@/lib/frontend/agent-handoff';
import { ANONYMOUS_BETA_MAX_LEVEL } from '@/lib/kolk/beta-contract';
import { serializeJsonForInlineScript } from '@/lib/frontend/inline-json';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; maxLevel: number }
  | { status: 'signed_in'; displayName: string | null; maxLevel: number };

function getRecommendedLevel(maxLevel: number, signedIn: boolean) {
  if (maxLevel <= 0) return 0;
  if (!signedIn && maxLevel >= ANONYMOUS_BETA_MAX_LEVEL) return null;
  if (signedIn && maxLevel >= 8) return null;
  return maxLevel + 1;
}

function absoluteUrl(path: string) {
  return `${APP_CONFIG.canonicalOrigin}${path}`;
}

const PLAY_SELECTORS = {
  primaryCta: '[data-kolk-primary-cta="true"]',
  levelCard: '[data-kolk-level]',
  authRequiredLevelCard: '[data-kolk-auth-required="true"]',
} as const;

export function PlayClient() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const agentStarterPrompt = getAgentStarterPrompt();
  const submitContractSnippet = getSubmitContractSnippet();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const update = () => setIsCompactLayout(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

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
  const primaryActionKolkAction =
    recommendedLevel != null
      ? 'open-recommended-challenge'
      : signedIn
      ? 'open-leaderboard'
      : 'sign-in-to-continue';
  const playState =
    auth.status === 'loading'
      ? null
      : {
          schemaVersion: 'kolk-play-state.v1',
          pageType: 'play',
          canonicalUrl: absoluteUrl('/play'),
          session: {
            status: auth.status,
            maxLevel,
          },
          recommended:
            recommendedLevel != null
              ? {
                  level: recommendedLevel,
                  challengeUrl: absoluteUrl(`/challenge/${recommendedLevel}`),
                  apiUrl: absoluteUrl(`/api/challenge/${recommendedLevel}`),
                  action: 'open_challenge_url_in_same_browser_session',
                }
              : {
                  level: null,
                  challengeUrl: null,
                  apiUrl: null,
                  action: signedIn ? 'public_beta_cleared' : 'sign_in_to_continue',
                },
          levels: levelCards.map((card) => {
            const authRequired = card.level > ANONYMOUS_BETA_MAX_LEVEL;

            return {
              level: card.level,
              name: card.name,
              url: absoluteUrl(`/challenge/${card.level}`),
              apiUrl: absoluteUrl(`/api/challenge/${card.level}`),
              anonymousAllowed: !authRequired,
              authRequired,
            };
          }),
          selectors: PLAY_SELECTORS,
          docs: {
            skill: absoluteUrl('/kolk_arena.md'),
            llms: absoluteUrl('/llms.txt'),
            manifest: absoluteUrl('/ai-action-manifest.json'),
            submissionApi: `${APP_CONFIG.docsOrigin}/SUBMISSION_API.md`,
            integrationGuide: `${APP_CONFIG.docsOrigin}/INTEGRATION_GUIDE.md`,
          },
        };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {copy.play.badge}
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">{copy.play.title}</h1>
          <p className="max-w-3xl text-base leading-7 text-slate-700">
            {copy.play.body}
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
                <span className="font-mono font-semibold text-slate-950">L{ANONYMOUS_BETA_MAX_LEVEL}</span>.{' '}
                <Link href="/profile" className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">
                  {copy.play.session.signInCta}
                </Link>{' '}
                {copy.play.session.signedOutTail}
              </>
            )}
          </p>
          <p className="max-w-3xl rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
            <span className="font-semibold text-slate-800">For browser agents:</span>{' '}
            Give your browser agent the recommended challenge URL. The challenge page contains the machine-readable state.
          </p>
          {primaryAction ? (
            <Link
              href={primaryAction.href}
              data-kolk-action={!isCompactLayout ? primaryActionKolkAction : undefined}
              data-kolk-primary-cta={!isCompactLayout ? 'true' : undefined}
              data-kolk-level={recommendedLevel ?? undefined}
              className="memory-accent-button hidden min-h-11 w-fit items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 sm:inline-flex"
            >
              {primaryAction.label}
            </Link>
          ) : null}
        </header>

        <section className="sm:hidden rounded-md border border-slate-200 bg-white p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{summary.modeLabel}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {auth.status === 'loading' ? summary.loadingValue : signedIn ? summary.signedInMode : summary.anonymousMode}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{summary.progressLabel}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {auth.status === 'loading' ? summary.loadingValue : summary.progressValue(maxLevel)}
                </p>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{summary.nextLabel}</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {auth.status === 'loading'
                  ? summary.loadingValue
                  : recommendedLevel != null
                  ? summary.nextStepStart(recommendedLevel)
                  : signedIn
                  ? summary.nextStepComplete
                  : summary.nextStepSignIn}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {recommendedLevel === 0
                  ? copy.challenge.deliveryRules.level0
                  : recommendedLevel != null
                  ? playUi.startLevel(recommendedLevel)
                  : signedIn
                  ? summary.signedInUnlockHint
                  : summary.anonymousUnlockHint}
              </p>
            </div>
          </div>
        </section>

        {playState ? (
          <script
            id="kolk-play-state"
            type="application/vnd.kolk.play+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonForInlineScript(playState) }}
          />
        ) : null}

        <section className="hidden gap-4 sm:grid sm:grid-cols-3">
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
          <section
            className="rounded-md border border-slate-200 bg-white p-6"
            data-kolk-level={l0Card.level}
            data-kolk-auth-required="false"
          >
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
                data-kolk-action={!isCompactLayout ? 'open-recommended-challenge' : undefined}
                data-kolk-level={l0Card.level}
                className="memory-accent-button hidden min-h-11 w-full items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 sm:inline-flex sm:w-auto"
              >
                {playUi.runLevel0}
              </Link>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {summary.nextStepStart(0)}. {copy.play.contract.bullets[0]}
            </p>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 relative">
          {ladderCards.map((card) => {
            const requiresAuth = card.level > ANONYMOUS_BETA_MAX_LEVEL;
            const isLocked = requiresAuth && !signedIn;
            const hasUnlockedProgression = card.level === 1 || maxLevel >= card.level - 1;
            const isBlockedByProgression = !isLocked && !hasUnlockedProgression;
            const isCleared =
              maxLevel >= card.level;
            const isRecommended = recommendedLevel === card.level;
            const stateBadge =
              isLocked
                ? { label: playUi.signInRequiredBadge, className: 'border border-slate-200 bg-slate-50 text-slate-600' }
                : isBlockedByProgression
                ? { label: playUi.progressionLocked(card.level - 1), className: 'border border-slate-200 bg-slate-50 text-slate-600' }
                : isRecommended
                ? { label: playUi.recommendedBadge, className: 'border border-slate-950 bg-slate-950 text-white' }
                : isCleared
                ? { label: playUi.clearedBadge, className: 'border border-slate-300 bg-slate-100 text-slate-700' }
                : null;
            const tierLabel = requiresAuth ? playUi.competitiveBadge : playUi.practiceBadge;

            return (
              <article
                key={card.level}
                data-kolk-level={card.level}
                data-kolk-auth-required={requiresAuth ? 'true' : 'false'}
                className={`relative flex flex-col gap-3 sm:gap-4 rounded-md border border-slate-200 bg-white p-4 sm:p-6 ${
                  isRecommended ? 'ring-2 ring-slate-950 ring-offset-2' : ''
                }`}
              >
                <div className="flex items-center sm:items-start justify-between gap-3">
                  <div className="flex items-center sm:items-start gap-3 min-w-0 flex-1">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 font-mono text-sm font-semibold text-slate-700">
                      L{card.level}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-base font-bold text-slate-950 truncate">{card.name}</h2>
                      <p className="mt-0.5 sm:mt-1 text-xs leading-5 text-slate-600 truncate">
                        {playUi.bandLabel(card.band)} · {playUi.suggestedTime(card.suggestedTimeMinutes)}
                        <span className="hidden sm:inline"> · {tierLabel}</span>
                      </p>
                    </div>
                  </div>
                  {stateBadge ? (
                    <span className={`shrink-0 inline-flex items-center rounded-md px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-medium ${stateBadge.className}`}>
                      <span className="hidden sm:inline">{stateBadge.label}</span>
                      <span className="sm:hidden">
                        {isLocked ? 'Locked' : isBlockedByProgression ? 'Locked' : isCleared ? 'Cleared' : 'New'}
                      </span>
                    </span>
                  ) : null}
                </div>

                <p className="line-clamp-2 text-xs leading-5 text-slate-600 sm:hidden">{card.hint}</p>
                <p className="hidden text-sm leading-6 text-slate-700 sm:block">{card.hint}</p>

                <div className="mt-auto hidden sm:flex flex-wrap items-center gap-2 pt-2">
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
                      data-kolk-action={
                        isRecommended && !isCompactLayout ? 'open-recommended-challenge' : 'open-level'
                      }
                      data-kolk-level={card.level}
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
                {/* Mobile tap target overlay that makes the whole card clickable */}
                {!isLocked && !isBlockedByProgression && (
                  <Link
                    href={`/challenge/${card.level}`}
                    data-kolk-action={
                      isRecommended && isCompactLayout ? 'open-recommended-challenge' : 'open-level'
                    }
                    data-kolk-level={card.level}
                    className="absolute inset-0 z-10 sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 rounded-md"
                    aria-label={playUi.startLevel(card.level)}
                  />
                )}
                {isLocked && (
                  <Link
                    href="/profile"
                    className="absolute inset-0 z-10 sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 rounded-md"
                    aria-label={playUi.signInUnlockLevels}
                  />
                )}
                {isBlockedByProgression && (
                  <Link
                    href={`/challenge/${card.level - 1}`}
                    className="absolute inset-0 z-10 sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 rounded-md"
                    aria-label={playUi.goToLevel(card.level - 1)}
                  />
                )}
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
      {primaryAction ? (
        <>
          <div className="h-28 sm:hidden" aria-hidden="true" />
          <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm">
            <Link
              href={primaryAction.href}
              data-kolk-action={primaryActionKolkAction}
              data-kolk-primary-cta={isCompactLayout ? 'true' : undefined}
              data-kolk-level={recommendedLevel ?? undefined}
              className="memory-accent-button inline-flex min-h-11 w-full items-center justify-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
            >
              {primaryAction.label}
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
