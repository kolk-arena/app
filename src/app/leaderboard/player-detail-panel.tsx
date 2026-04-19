'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { copy } from '@/i18n';
import { formatDateTime, formatNumber } from '@/i18n/format';
import type { LeaderboardPlayerDetail } from '@/lib/kolk/leaderboard/player-detail';

function formatScore(value: number | null) {
  if (value == null) return copy.leaderboard.table.noSubmissionFallback;
  return formatNumber(value, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatDate(value: string | null) {
  if (!value) return copy.leaderboard.playerDetail.lastSubmissionFallback;
  return formatDateTime(value, value);
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

function tierClasses(tier: string) {
  switch (tier) {
    case 'champion':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'specialist':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    case 'builder':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

export function PlayerDetailPanel({
  playerId,
  onClear,
  onRetry,
  panelId,
}: {
  playerId: string | null;
  onClear: () => void;
  onRetry: () => void;
  panelId: string;
}) {
  const [requestState, setRequestState] = useState<{
    playerId: string | null;
    detail: LeaderboardPlayerDetail | null;
    error: string | null;
  }>({
    playerId: null,
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
          detail: payload,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setRequestState({
          playerId,
          detail: null,
          error: err instanceof Error ? err.message : copy.leaderboard.playerDetail.failedToLoadTitle,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [playerId]);

  const loading = playerId != null && requestState.playerId !== playerId && requestState.error == null;
  const detail = playerId && requestState.playerId === playerId ? requestState.detail : null;
  const error = playerId && requestState.playerId === playerId ? requestState.error : null;

  const pd = copy.leaderboard.playerDetail;

  if (!playerId) {
    return (
      <aside id={panelId} className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-live="polite">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.eyebrow}</p>
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
      <aside id={panelId} className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-live="polite" aria-busy="true">
        <div className="px-4 py-6 text-sm text-slate-500 sm:px-5">{pd.loading}</div>
      </aside>
    );
  }

  if (error || !detail) {
    return (
      <aside id={panelId} className="rounded-2xl border border-rose-200 bg-rose-50 shadow-sm" aria-live="polite">
        <div className="px-4 py-6 text-sm text-rose-900 sm:px-5">
          <p className="font-semibold">{pd.failedToLoadTitle}</p>
          <p className="mt-1">{error ?? pd.failedToLoadFallback}</p>
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-800 transition hover:bg-rose-100"
              >
                {pd.retry}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex min-h-11 items-center rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-800 transition hover:bg-rose-100"
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

  return (
    <aside id={panelId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-live="polite">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.eyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              {detail.userRow.display_name ?? pd.profilePlayerFallback}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {detail.userRow.handle ? `@${detail.userRow.handle}` : pd.noPublicHandle}
            </p>
            {detail.userRow.pioneer === true ? (
              <p className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                {pd.betaPioneerBadge}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${tierClasses(
                tier,
              )}`}
            >
              {tier}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-50"
            >
              {pd.clearShort}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.highestLevel}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">L{highestLevel}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.totalScore}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatScore(totalScore)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.levelsCompleted}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{levelsCompleted}</p>
          </div>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.schoolLabel}</dt>
            <dd className="mt-2 break-words font-medium text-slate-900">{detail.userRow.school ?? pd.schoolFallback}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.frameworkLabel}</dt>
            <dd className="mt-2 break-words font-medium text-slate-900">{detail.userRow.framework ?? pd.frameworkFallback}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.countryLabel}</dt>
            <dd className="mt-2 font-medium text-slate-900">{detail.userRow.country ?? pd.countryFallback}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.lastSubmissionLabel}</dt>
            <dd className="mt-2 font-medium text-slate-900">{formatDate(lastSubmissionAt)}</dd>
          </div>
        </dl>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.bestScoresHeading}</p>
              <p className="mt-1 text-sm text-slate-500">{pd.bestScoresSubtitle}</p>
            </div>
            <Link
              href={`/leaderboard/${playerId}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-50"
            >
              {pd.openPage}
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {levelCards.length > 0 ? (
              levelCards.map((entry) => (
                <span
                  key={entry.level}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <span>L{entry.level}</span>
                  <span className="text-slate-400">·</span>
                  <span>{formatScore(entry.score)}</span>
                </span>
              ))
            ) : (
              <p className="text-sm text-slate-500">{pd.noLevelHistory}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200">
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
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                          {pd.levelLabel(submission.level)}
                        </span>
                        <span className="text-sm font-semibold text-slate-950">{formatScore(submission.total_score)}</span>
                        <span className="text-sm text-slate-400">{pd.totalSuffix}</span>
                      </div>
                      <p className="mt-2 break-words text-sm leading-6 text-slate-600">
                        {submission.judge_summary ?? pd.noSummary}
                      </p>
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                      {formatDate(submission.submitted_at)}
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.structureLabel}</p>
                      <p className="mt-2 text-base font-semibold text-slate-950">{formatScore(submission.structure_score)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.coverageLabel}</p>
                      <p className="mt-2 text-base font-semibold text-slate-950">{formatScore(submission.coverage_score)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.qualityLabel}</p>
                      <p className="mt-2 text-base font-semibold text-slate-950">{formatScore(submission.quality_score)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {submission.repo_url ? (
                      <a
                        href={submission.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        {pd.viewRepo}
                      </a>
                    ) : null}
                    {submission.commit_hash ? (
                          <code className="max-w-full overflow-x-auto rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                            {submission.commit_hash}
                          </code>
                    ) : null}
                    {normalizeFlags(submission.flags).map((flag) => (
                      <span
                        key={flag}
                        className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
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
