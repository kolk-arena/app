'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { useLocalizedDateTimeFormatter } from '@/components/time/localized-time';
import { copy } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import { buildPlayerBadge } from '@/lib/frontend/badge';
import { countryCodeFromInput, countryNameFromCode } from '@/lib/frontend/countries';
import type { LeaderboardPlayerDetail } from '@/lib/kolk/leaderboard/player-detail';

function formatScore(value: number | null) {
  if (value == null) return copy.leaderboard.table.noSubmissionFallback;
  return formatNumber(value, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function normalizeBestScores(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [] as Array<{ level: number; score: number }>;
  }

  return Object.entries(value)
    .map(([level, score]) => ({
      level: Number(level),
      score: typeof score === 'number' ? score : Number(score),
    }))
    .filter((entry) => Number.isFinite(entry.level) && entry.level > 0 && Number.isFinite(entry.score))
    .sort((a, b) => b.level - a.level);
}

function normalizeFlags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0);
}

function formatCountryLabel(value: string | null | undefined) {
  const code = countryCodeFromInput(value);
  if (!code) return value?.trim() || null;
  return countryNameFromCode(code) ?? code;
}

function tierClasses(tier: string) {
  switch (tier) {
    case 'champion':
      return 'border-slate-900 bg-slate-900 text-white';
    case 'specialist':
      return 'border-slate-300 bg-slate-100 text-slate-800';
    case 'builder':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

export function PlayerDetailPanel({
  playerId,
  onClear,
  onRetry,
  panelId,
  detailPageSearch,
  outsideCurrentView = false,
}: {
  playerId: string | null;
  onClear: () => void;
  onRetry: () => void;
  panelId: string;
  detailPageSearch: string;
  outsideCurrentView?: boolean;
}) {
  const [requestState, setRequestState] = useState<{
    playerId: string | null;
    status: 'idle' | 'success' | 'error';
    detail: LeaderboardPlayerDetail | null;
    error: string | null;
  }>({
    playerId: null,
    status: 'idle',
    detail: null,
    error: null,
  });

  useEffect(() => {
    if (!playerId) return;

    let active = true;
    const controller = new AbortController();

    void fetch(`/api/leaderboard/${playerId}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as LeaderboardPlayerDetail & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? copy.leaderboard.playerDetail.failedToLoadTitle);
        }
        if (!active) return;
        setRequestState({
          playerId,
          status: 'success',
          detail: payload,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setRequestState({
          playerId,
          status: 'error',
          detail: null,
          error: err instanceof Error ? err.message : copy.leaderboard.playerDetail.failedToLoadTitle,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [playerId]);

  const loading = playerId != null && requestState.playerId !== playerId;
  const detail =
    playerId && requestState.playerId === playerId && requestState.status === 'success' ? requestState.detail : null;
  const error =
    playerId && requestState.playerId === playerId && requestState.status === 'error' ? requestState.error : null;

  const pd = copy.leaderboard.playerDetail;
  const formatLocalDateTime = useLocalizedDateTimeFormatter();

  if (!playerId) {
    return (
      <aside
        id={panelId}
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-live="polite"
      >
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500">{pd.eyebrow}</p>
          <h2 className="mt-2 text-base font-semibold text-slate-950">{pd.selectAPlayerTitle}</h2>
        </div>
        <div className="px-4 py-6 text-sm leading-6 text-slate-500 sm:px-5">
          {pd.selectAPlayerBody}
        </div>
      </aside>
    );
  }

  if (loading && !detail) {
    return (
      <aside
        id={panelId}
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="px-4 py-6 text-sm text-slate-500 sm:px-5">{pd.loading}</div>
      </aside>
    );
  }

  if (error || !detail) {
    return (
      <aside
        id={panelId}
        className="rounded-xl border border-rose-200 bg-rose-50 shadow-sm"
        aria-live="polite"
      >
        <div className="px-4 py-6 text-sm text-rose-900 sm:px-5">
          <p className="font-semibold">{pd.failedToLoadTitle}</p>
          <p className="mt-1">{error ?? pd.failedToLoadFallback}</p>
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition-colors duration-150 hover:bg-rose-100"
              >
                {pd.retry}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex min-h-11 items-center rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition-colors duration-150 hover:bg-rose-100"
              >
                {pd.clearSelection}
              </button>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const levelCards = normalizeBestScores(detail.leaderboardRow.best_scores);
  const recentSubmissions = Array.isArray(detail.submissions) ? detail.submissions : [];
  const tier = String(detail.leaderboardRow.tier ?? pd.tierFallback);
  const highestLevel = Number(detail.leaderboardRow.highest_level ?? 0);
  const totalScore = Number(detail.leaderboardRow.total_score ?? 0);
  const levelsCompleted = Number(detail.leaderboardRow.levels_completed ?? 0);
  const lastSubmissionAt =
    typeof detail.leaderboardRow.last_submission_at === 'string'
      ? detail.leaderboardRow.last_submission_at
      : null;
  const lastSubmissionLabel = lastSubmissionAt
    ? formatLocalDateTime(lastSubmissionAt, lastSubmissionAt)
    : pd.lastSubmissionFallback;
  const affiliation = detail.userRow.affiliation;
  const agentStack = detail.userRow.agent_stack;

  // Compact README badge for the sidebar. Uses the same canonical source
  // (userRow.max_level) as the dedicated player page, falling back to the
  // leaderboard row's `highest_level`. No badge if the player has no
  // submissions yet.
  const badgeCopy = copy.leaderboard.badge;
  const sidebarHighestLevel =
    typeof detail.userRow.max_level === 'number' && Number.isFinite(detail.userRow.max_level)
      ? detail.userRow.max_level
      : recentSubmissions.length > 0
      ? highestLevel
      : -1;
  const sidebarBadge = buildPlayerBadge({
    playerId,
    highestLevel: sidebarHighestLevel,
    pioneer: detail.userRow.pioneer === true,
    displayName: detail.userRow.display_name,
  });
  const publicProfileUrl = `${APP_CONFIG.canonicalOrigin}/leaderboard/${playerId}`;
  const fullPageHref = `/leaderboard/${playerId}${detailPageSearch}`;

  return (
    <aside
      id={panelId}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      aria-live="polite"
    >
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">{pd.eyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              {detail.userRow.display_name ?? pd.profilePlayerFallback}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {detail.userRow.handle ? `@${detail.userRow.handle}` : pd.noPublicHandle}
            </p>
            {detail.userRow.pioneer === true ? (
              <p className="memory-accent-chip mt-2 inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold">
                {pd.betaPioneerBadge}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <span
              className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${tierClasses(
                tier,
              )}`}
            >
              {tier}
            </span>
            <CopyButton
              value={publicProfileUrl}
              idleLabel={pd.copyProfileLink}
              copiedLabel={pd.copiedProfileLink}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
            />
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
            >
              {pd.clearShort}
            </button>
          </div>
        </div>
      </div>

      {outsideCurrentView ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-5">
          <p className="font-semibold">{copy.leaderboard.detailOutsideViewTitle}</p>
          <p className="mt-1">{copy.leaderboard.detailOutsideViewBody}</p>
        </div>
      ) : null}

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{pd.highestLevel}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 tabular-nums">L{highestLevel}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{pd.totalScore}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 tabular-nums">{formatScore(totalScore)}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{pd.levelsCompleted}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 tabular-nums">{levelsCompleted}</p>
          </div>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 px-4 py-3">
            <dt className="text-xs font-medium text-slate-500">{pd.affiliationLabel}</dt>
            <dd className="mt-2 break-words font-medium text-slate-900">{affiliation ?? pd.affiliationFallback}</dd>
          </div>
          <div className="rounded-md border border-slate-200 px-4 py-3">
            <dt className="text-xs font-medium text-slate-500">{pd.agentStackLabel}</dt>
            <dd className="mt-2 break-words font-medium text-slate-900">{agentStack ?? pd.agentStackFallback}</dd>
          </div>
          <div className="rounded-md border border-slate-200 px-4 py-3">
            <dt className="text-xs font-medium text-slate-500">{pd.countryLabel}</dt>
            <dd className="mt-2 font-medium text-slate-900">
              {formatCountryLabel(detail.userRow.country) ?? pd.countryFallback}
            </dd>
          </div>
          <div className="rounded-md border border-slate-200 px-4 py-3">
            <dt className="text-xs font-medium text-slate-500">{pd.lastSubmissionLabel}</dt>
            <dd className="mt-2 font-medium text-slate-900">{lastSubmissionLabel}</dd>
          </div>
        </dl>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">{pd.bestScoresHeading}</p>
              <p className="mt-1 text-sm text-slate-500">{pd.bestScoresSubtitle}</p>
            </div>
            <Link
              href={fullPageHref}
              className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
            >
              {pd.openPage}
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {levelCards.length > 0 ? (
              levelCards.map((entry) => (
                <span
                  key={entry.level}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  <span className="tabular-nums">L{entry.level}</span>
                  <span className="text-slate-400">·</span>
                  <span className="tabular-nums">{formatScore(entry.score)}</span>
                </span>
              ))
            ) : (
              <p className="text-sm text-slate-500">{pd.noLevelHistory}</p>
            )}
          </div>
        </div>

        {sidebarBadge ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-medium text-slate-500">
              {badgeCopy.sidebarEyebrow}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sidebarBadge.shieldsUrl} alt={sidebarBadge.displayLabel} className="h-6" />
              <CopyButton
                value={sidebarBadge.markdown}
                idleLabel={badgeCopy.sidebarCopyButton}
                copiedLabel={badgeCopy.sidebarCopiedButton}
                failedLabel={badgeCopy.copyFailed}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-md border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-950">{pd.recentSubmissionsHeading}</h3>
            <p className="mt-1 text-sm text-slate-500">{pd.recentSubmissionsSubtitle}</p>
          </div>

          <div className="divide-y divide-slate-200">
            {recentSubmissions.length > 0 ? (
              recentSubmissions.map((submission) => (
                <article key={submission.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {pd.levelLabel(submission.level)}
                        </span>
                        <span className="text-sm font-semibold text-slate-950 tabular-nums">{formatScore(submission.total_score)}</span>
                        <span className="text-sm text-slate-400">{pd.totalSuffix}</span>
                      </div>
                      <p className="mt-2 break-words text-sm leading-6 text-slate-600">
                        {submission.judge_summary ?? pd.noSummary}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-slate-400">
                      {submission.submitted_at
                        ? formatLocalDateTime(submission.submitted_at, submission.submitted_at)
                        : pd.lastSubmissionFallback}
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-xs font-medium text-slate-500">{pd.structureLabel}</p>
                      <p className="mt-2 text-base font-semibold text-slate-950 tabular-nums">{formatScore(submission.structure_score)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-xs font-medium text-slate-500">{pd.coverageLabel}</p>
                      <p className="mt-2 text-base font-semibold text-slate-950 tabular-nums">{formatScore(submission.coverage_score)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-xs font-medium text-slate-500">{pd.qualityLabel}</p>
                      <p className="mt-2 text-base font-semibold text-slate-950 tabular-nums">{formatScore(submission.quality_score)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {submission.repo_url ? (
                      <a
                        href={submission.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {pd.viewRepo}
                      </a>
                    ) : null}
                    {submission.commit_hash ? (
                      <code className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                        {submission.commit_hash}
                      </code>
                    ) : null}
                    {normalizeFlags(submission.flags).map((flag) => (
                      <span
                        key={flag}
                        className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <div className="px-4 py-8 text-sm text-slate-500">{pd.noPublicHistory}</div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
