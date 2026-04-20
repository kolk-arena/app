'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { copy } from '@/i18n';
import { formatClockSeconds, formatDateTime, formatNumber } from '@/i18n/format';
import { getFlagEmoji } from '@/lib/frontend/flag';
import type { ActivitySubmissionDetail } from '@/lib/kolk/types';

/**
 * ActivityDetailPanel
 *
 * Sibling to PlayerDetailPanel. Used when an *anonymous* activity row is
 * clicked — anonymous submissions have no `ka_users` row to link to, so
 * we show the submission itself in a detail-panel shape.
 *
 * Registered-user activity rows skip this panel entirely and link
 * through to `/leaderboard/:playerId` via the existing `<Link>` in
 * `ActivityFeedItem`.
 */

function formatScore(value: number | null) {
  if (value == null) return copy.leaderboard.table.noSubmissionFallback;
  return formatNumber(value, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function bandDotClasses(band: ActivitySubmissionDetail['color_band']) {
  switch (band) {
    case 'BLUE':
      return 'bg-sky-500';
    case 'GREEN':
      return 'bg-emerald-500';
    case 'YELLOW':
      return 'bg-amber-400';
    case 'ORANGE':
      return 'bg-orange-500';
    case 'RED':
      return 'bg-rose-500';
    default:
      return 'bg-slate-300';
  }
}

export function ActivityDetailPanel({
  submissionId,
  onClear,
  panelId,
  detailPageSearch,
}: {
  submissionId: string | null;
  onClear: () => void;
  panelId: string;
  detailPageSearch: string;
}) {
  // Pattern mirrors PlayerDetailPanel: effect only dispatches async
  // setState from fetch callbacks, never synchronously in the effect
  // body (lint rule `react-hooks/set-state-in-effect`). While a new
  // fetch is in flight `requestState.submissionId` still points at the
  // previous submissionId, so we derive the displayed status below
  // by comparing to the current `submissionId` prop.
  const [requestState, setRequestState] = useState<{
    submissionId: string | null;
    status: 'idle' | 'success' | 'error';
    detail: ActivitySubmissionDetail | null;
    error: string | null;
  }>({
    submissionId: null,
    status: 'idle',
    detail: null,
    error: null,
  });

  useEffect(() => {
    if (!submissionId) return;

    let active = true;
    const controller = new AbortController();

    void fetch(`/api/activity/submission/${submissionId}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          submission?: ActivitySubmissionDetail;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? copy.leaderboard.activityDetail.failedToLoad);
        }
        if (!active) return;
        setRequestState({
          submissionId,
          status: 'success',
          detail: payload.submission ?? null,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setRequestState({
          submissionId,
          status: 'error',
          detail: null,
          error: err instanceof Error ? err.message : copy.leaderboard.activityDetail.failedToLoad,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [submissionId]);

  if (!submissionId) {
    return null;
  }

  const ad = copy.leaderboard.activityDetail;
  // Effective state = "loading" while the effect's fetch hasn't returned
  // for the current submissionId yet (or when we're transitioning from a
  // previous selection to a new one).
  const isFresh = requestState.submissionId === submissionId;
  const effectiveStatus: 'loading' | 'success' | 'error' = !isFresh
    ? 'loading'
    : requestState.status === 'idle'
    ? 'loading'
    : requestState.status;
  const effectiveDetail = isFresh && requestState.status === 'success' ? requestState.detail : null;
  const effectiveError = isFresh && requestState.status === 'error' ? requestState.error : null;

  return (
    <aside
      id={panelId}
      aria-label={ad.panelLabel}
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {ad.eyebrow}
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-950">{ad.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {ad.close}
        </button>
      </div>

      {effectiveStatus === 'loading' ? (
        <div className="px-4 py-6 text-sm text-slate-500 sm:px-5">{ad.loading}</div>
      ) : null}

      {effectiveStatus === 'error' ? (
        <div className="px-4 py-6 text-sm text-rose-700 sm:px-5">
          {effectiveError ?? ad.failedToLoad}
        </div>
      ) : null}

      {effectiveStatus === 'success' && effectiveDetail ? (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span aria-hidden="true" className="text-lg">
              {getFlagEmoji(effectiveDetail.country_code)}
            </span>
            <span className="font-semibold text-slate-950">{effectiveDetail.display_name}</span>
            <span className="text-slate-500">
              {effectiveDetail.unlocked ? ad.verbPassed : ad.verbAttempted}
            </span>
            <span className="font-semibold text-slate-950 tabular-nums">
              L{effectiveDetail.level}
            </span>
            {effectiveDetail.framework ? (
              <span className="text-slate-500">
                {ad.usingFrameworkPrefix}
                {effectiveDetail.framework}
              </span>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {ad.totalLabel}
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 font-semibold text-slate-950 tabular-nums">
                <span
                  aria-hidden="true"
                  className={`inline-flex h-2 w-2 rounded-md ${bandDotClasses(effectiveDetail.color_band)}`}
                />
                {formatScore(effectiveDetail.total_score)}
              </dd>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {ad.structureLabel}
              </dt>
              <dd className="mt-1 font-semibold text-slate-950 tabular-nums">
                {formatScore(effectiveDetail.structure_score)}
              </dd>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {ad.coverageLabel}
              </dt>
              <dd className="mt-1 font-semibold text-slate-950 tabular-nums">
                {formatScore(effectiveDetail.coverage_score)}
              </dd>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {ad.qualityLabel}
              </dt>
              <dd className="mt-1 font-semibold text-slate-950 tabular-nums">
                {formatScore(effectiveDetail.quality_score)}
              </dd>
            </div>
          </dl>

          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="font-semibold uppercase tracking-wider text-slate-500">
                {ad.solveTimeLabel}
              </dt>
              <dd className="mt-1 text-slate-900 tabular-nums">
                {effectiveDetail.solve_time_seconds == null
                  ? ad.notAvailable
                  : formatClockSeconds(effectiveDetail.solve_time_seconds)}
                {effectiveDetail.efficiency_badge ? ' ⚡' : ''}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wider text-slate-500">
                {ad.countryLabel}
              </dt>
              <dd className="mt-1 text-slate-900">
                {effectiveDetail.country_code ?? ad.notAvailable}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wider text-slate-500">
                {ad.submittedLabel}
              </dt>
              <dd className="mt-1 text-slate-900 tabular-nums">
                {effectiveDetail.submitted_at
                  ? formatDateTime(effectiveDetail.submitted_at, effectiveDetail.submitted_at)
                  : ad.notAvailable}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wider text-slate-500">
                {ad.tierLabel}
              </dt>
              <dd className="mt-1 text-slate-900">
                {effectiveDetail.quality_label ?? ad.notAvailable}
              </dd>
            </div>
          </dl>

          {effectiveDetail.judge_summary ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {ad.judgeSummaryLabel}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-800">{effectiveDetail.judge_summary}</p>
            </div>
          ) : null}

          {effectiveDetail.player_id ? (
            <Link
              href={`/leaderboard/${effectiveDetail.player_id}${detailPageSearch}`}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-slate-50"
            >
              {ad.openFullProfile}
            </Link>
          ) : (
            <p className="text-xs italic text-slate-500">{ad.anonymousNote}</p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
