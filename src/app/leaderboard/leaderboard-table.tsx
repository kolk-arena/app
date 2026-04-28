'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocalizedDateTimeFormatter } from '@/components/time/localized-time';
import { copy } from '@/i18n';
import { formatClockSeconds, formatNumber } from '@/i18n/format';
import { getFlagEmoji } from '@/lib/frontend/flag';
import type { LeaderboardEntry } from '@/lib/kolk/types';

/**
 * Trigger a 2-second highlight whenever `value` flips.
 *
 * Pattern: track the last value we ever highlighted for. On render, if
 * `value` differs from `lastHighlightedFor`, we know it just changed and
 * we're inside the highlight window. The effect schedules a state flip
 * (`lastHighlightedFor := value`) 2s later to drop out of the window.
 *
 * This keeps the hook pure during render (no `Date.now()` reads) and
 * the only `setState` in the effect is the deferred clear, which is the
 * intended use of effects per React's purity rules.
 */
function useHighlightOnChange(value: string | null) {
  const [lastHighlightedFor, setLastHighlightedFor] = useState<string | null>(value);
  const isHighlighted = lastHighlightedFor !== value;

  useEffect(() => {
    if (lastHighlightedFor === value) return;
    const timer = setTimeout(() => setLastHighlightedFor(value), 2000);
    return () => clearTimeout(timer);
  }, [value, lastHighlightedFor]);

  return isHighlighted;
}

function formatScore(value: number) {
  if (!Number.isFinite(value)) return copy.leaderboard.table.noSubmissionFallback;
  return formatNumber(value, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatSolveTime(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy.leaderboard.table.noSubmissionFallback;
  return formatClockSeconds(value);
}

function bandDotClasses(band: LeaderboardEntry['best_color_band']) {
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

function tierClasses(tier: string) {
  switch (tier) {
    case 'champion':
      return 'border border-slate-900 bg-slate-900 text-white';
    case 'specialist':
      return 'border border-slate-300 bg-slate-100 text-slate-800';
    case 'builder':
      return 'border border-slate-200 bg-slate-50 text-slate-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

function rankAccent(rank: number) {
  if (rank === 1) return 'memory-accent-rank';
  if (rank === 2) return 'text-slate-700 bg-slate-100 border border-slate-200';
  if (rank === 3) return 'text-slate-700 bg-slate-50 border border-slate-200';
  return 'text-slate-700 bg-white border-slate-200';
}

function leaderboardEntryKey(entry: LeaderboardEntry, surface: 'mobile' | 'desktop') {
  const publicIdentity = entry.row_key
    ?? entry.player_id
    ?? `anonymous:${entry.display_name}:${entry.country_code ?? 'global'}`;
  return `${surface}:${publicIdentity}`;
}

function LeaderboardMobileRow({
  entry,
  selectedPlayerId,
  selectedActivityId,
  onSelectAnonymous,
  detailPageSearch,
}: {
  entry: LeaderboardEntry;
  selectedPlayerId: string | null;
  selectedActivityId: string | null;
  onSelectAnonymous: (submissionId: string) => void;
  detailPageSearch: string;
}) {
  const isUpdated = useHighlightOnChange(entry.last_submission_at);
  const hasPublicProfile = !entry.is_anon && Boolean(entry.player_id);
  const anonymousSubmissionId = entry.is_anon ? entry.activity_submission_id : null;
  const hasAnonymousDetail = Boolean(anonymousSubmissionId);
  const isSelected = hasPublicProfile
    ? selectedPlayerId === entry.player_id
    : Boolean(hasAnonymousDetail && selectedActivityId === anonymousSubmissionId);
  const t = copy.leaderboard.table;
  const affiliation = entry.affiliation;
  const agentStack = entry.agent_stack;
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
  const lastSubmissionLabel = entry.last_submission_at
    ? formatLocalDateTime(entry.last_submission_at, entry.last_submission_at)
    : t.noSubmissionsYet;

  const rowClassName = `focus-gentle flex w-full flex-col gap-2.5 px-3 py-3 text-left transition-colors duration-1000 focus-visible:outline-none ${
    isUpdated
      ? 'bg-slate-100'
      : isSelected
      ? 'bg-slate-100/90'
      : 'bg-white hover:bg-slate-50/80'
  }`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex min-w-10 items-center justify-center rounded-md border px-2.5 py-1 ${rankAccent(entry.rank)}`}>
              {entry.rank}
            </span>
            <span className="text-sm" title={entry.country_code || t.globalCountryTooltip}>
              {getFlagEmoji(entry.country_code)}
            </span>
            <span className="min-w-0 break-words text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">{entry.display_name}</span>
            {entry.pioneer ? (
              <span className="memory-accent-chip inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold">
                {t.pioneerBadge}
              </span>
            ) : null}
            <span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-medium ${tierClasses(entry.tier)}`}>
              {entry.tier}
            </span>
          </div>
          <p className="break-words text-sm text-slate-500 [overflow-wrap:anywhere]">
            {entry.is_anon ? t.anonymousSession : entry.handle ? `@${entry.handle}` : t.noPublicHandle}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{agentStack ?? t.agentStackNotSet}</span>
            <span className="text-slate-300">·</span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{affiliation ?? t.affiliationFallback}</span>
          </div>
        </div>
        {hasPublicProfile || hasAnonymousDetail ? (
          <span className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
            {isSelected ? t.selectedLabel : t.viewLabel}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{t.highestLabel}</dt>
          <dd className="mt-1 font-medium text-slate-900">L{entry.highest_level}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{t.frontierLabel}</dt>
          <dd className="mt-1 flex items-center gap-2 font-medium text-slate-900 tabular-nums">
            <span
              aria-hidden="true"
              className={`inline-flex h-2.5 w-2.5 rounded-full ${bandDotClasses(entry.best_color_band ?? null)}`}
            />
            {formatScore(entry.best_score_on_highest)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{t.solveTimeLabel}</dt>
          <dd className="mt-1 font-medium text-slate-900 tabular-nums">
            {formatSolveTime(entry.solve_time_seconds)}
            {entry.efficiency_badge ? ' ⚡' : ''}
          </dd>
        </div>
      </dl>

      <p className="text-xs leading-5 text-slate-500">
        {t.lastSubmissionLabel(lastSubmissionLabel)}
      </p>
    </>
  );

  if (anonymousSubmissionId) {
    return (
      <button
        type="button"
        onClick={() => onSelectAnonymous(anonymousSubmissionId)}
        aria-pressed={isSelected}
        className={rowClassName}
        aria-label={t.openAnonymousDetailAriaLabel(entry.display_name)}
      >
        {content}
      </button>
    );
  }

  if (!hasPublicProfile || !entry.player_id) {
    return (
      <article className={rowClassName} aria-label={entry.display_name}>
        {content}
      </article>
    );
  }

  return (
    <Link
      href={`/leaderboard/${entry.player_id}${detailPageSearch}`}
      className={rowClassName}
      aria-label={t.openPlayerPageAriaLabel(entry.display_name)}
    >
      {content}
    </Link>
  );
}

function LeaderboardDesktopRow({
  entry,
  selectedPlayerId,
  selectedActivityId,
  onSelectPlayer,
  onSelectAnonymous,
  detailRegionId,
}: {
  entry: LeaderboardEntry;
  selectedPlayerId: string | null;
  selectedActivityId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onSelectAnonymous: (submissionId: string) => void;
  detailRegionId: string;
}) {
  const isUpdated = useHighlightOnChange(entry.last_submission_at);
  const hasPublicProfile = !entry.is_anon && Boolean(entry.player_id);
  const anonymousSubmissionId = entry.is_anon ? entry.activity_submission_id : null;
  const hasAnonymousDetail = Boolean(anonymousSubmissionId);
  const isSelected = hasPublicProfile
    ? selectedPlayerId === entry.player_id
    : Boolean(hasAnonymousDetail && selectedActivityId === anonymousSubmissionId);
  const t = copy.leaderboard.table;
  const affiliation = entry.affiliation;
  const agentStack = entry.agent_stack;
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
  const lastSubmissionLabel = entry.last_submission_at
    ? formatLocalDateTime(entry.last_submission_at, entry.last_submission_at)
    : t.noSubmissionsYet;

  return (
    <tr
      className={`align-top transition-colors duration-1000 ${
        isUpdated
          ? 'bg-slate-100'
          : isSelected
          ? 'bg-slate-100/90'
          : 'hover:bg-slate-50/80 bg-white'
      }`}
      aria-selected={isSelected}
    >
      <td className="border-b border-slate-100 px-2 py-1.5 font-semibold text-slate-900">
        <span className={`inline-flex min-w-10 items-center justify-center rounded-md border px-2.5 py-1 ${rankAccent(entry.rank)}`}>
          {entry.rank}
        </span>
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5">
        <div className="flex min-w-[13rem] max-w-[17rem] flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm" title={entry.country_code || t.globalCountryTooltip}>
              {getFlagEmoji(entry.country_code)}
            </span>
            {hasPublicProfile && entry.player_id ? (
              <button
                type="button"
                onClick={() => onSelectPlayer(entry.player_id!)}
                className="focus-gentle rounded-xl break-words px-1 py-0.5 text-left font-semibold text-slate-900 underline-offset-4 outline-none transition hover:underline [overflow-wrap:anywhere]"
                aria-controls={detailRegionId}
                aria-expanded={isSelected}
                aria-label={t.openPlayerDetailAriaLabel(entry.display_name)}
              >
                {entry.display_name}
              </button>
            ) : anonymousSubmissionId ? (
              <button
                type="button"
                onClick={() => onSelectAnonymous(anonymousSubmissionId)}
                className="focus-gentle rounded-xl break-words px-1 py-0.5 text-left font-semibold text-slate-900 underline-offset-4 outline-none transition hover:underline [overflow-wrap:anywhere]"
                aria-controls={detailRegionId}
                aria-expanded={isSelected}
                aria-label={t.openAnonymousDetailAriaLabel(entry.display_name)}
              >
                {entry.display_name}
              </button>
            ) : (
              <span className="break-words rounded-xl px-1 py-0.5 font-semibold text-slate-900 [overflow-wrap:anywhere]">
                {entry.display_name}
              </span>
            )}
            {entry.pioneer ? (
              <span className="memory-accent-chip inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold">
                {t.pioneerBadge}
              </span>
            ) : null}
            {hasPublicProfile || hasAnonymousDetail ? (
              <span className="text-xs font-medium text-slate-400">
                {isSelected ? t.selectedLabel : t.viewLabel}
              </span>
            ) : null}
          </div>
          {entry.is_anon ? (
            <span className="text-xs text-slate-500">{t.anonymousSession}</span>
          ) : entry.handle ? (
            <span className="text-xs text-slate-500">@{entry.handle}</span>
          ) : (
            <span className="text-xs text-slate-400">{t.noPublicHandle}</span>
          )}
          <span className="break-words text-xs text-slate-400 [overflow-wrap:anywhere]">{affiliation ?? t.affiliationFallback}</span>
        </div>
      </td>
      <td className="break-words border-b border-slate-100 px-2 py-1.5 text-slate-600 [overflow-wrap:anywhere]">
        {agentStack ?? t.agentStackNotSet}
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5">
        <span className="inline-flex min-w-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800">
          L{entry.highest_level}
        </span>
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5 font-medium text-slate-900">
        <div className="flex flex-col gap-1">
          <span className="tabular-nums">{formatScore(entry.best_score_on_highest)}</span>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span
              aria-hidden="true"
              className={`inline-flex h-2.5 w-2.5 rounded-full ${bandDotClasses(entry.best_color_band ?? null)}`}
            />
            {entry.best_quality_label ?? t.frontierFallback}
          </span>
        </div>
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5 font-medium text-slate-900">
        <div className="flex flex-col gap-1">
          <span className="tabular-nums">{formatSolveTime(entry.solve_time_seconds)}</span>
          <span className="text-xs text-slate-400">
            {entry.efficiency_badge ? t.efficiencyBadge : t.timeTieBreak}
          </span>
        </div>
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5">
        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${tierClasses(entry.tier)}`}>
          {entry.tier}
        </span>
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5 text-slate-600">
        {lastSubmissionLabel}
      </td>
    </tr>
  );
}

export function LeaderboardTable({
  entries,
  selectedPlayerId,
  selectedActivityId,
  onSelectPlayer,
  onSelectAnonymous,
  detailRegionId,
  detailPageSearch,
}: {
  entries: LeaderboardEntry[];
  selectedPlayerId: string | null;
  selectedActivityId: string | null;
  onSelectPlayer: (playerId: string) => void;
  onSelectAnonymous: (submissionId: string) => void;
  detailRegionId: string;
  detailPageSearch: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-200 md:hidden">
        {entries.map((entry) => (
          <LeaderboardMobileRow
            // Key MUST NOT include `last_submission_at` or rank. Polling
            // changes those values, and remounting would reset the
            // useHighlightOnChange state. Anonymous rows deliberately have
            // player_id=null, so use their public stable label instead of
            // collapsing every anonymous tie into a `null-rank` key.
            key={leaderboardEntryKey(entry, 'mobile')}
            entry={entry}
            selectedPlayerId={selectedPlayerId}
            selectedActivityId={selectedActivityId}
            onSelectAnonymous={onSelectAnonymous}
            detailPageSearch={detailPageSearch}
          />
        ))}
      </div>

      <div className="hidden max-h-[68vh] overflow-auto md:block">
        <table className="w-full min-w-[51rem] border-collapse text-left text-sm text-slate-700">
          <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colRank}</th>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colPlayer}</th>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colAgentStack}</th>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colHighest}</th>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colFrontierScore}</th>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colSolveTime}</th>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colTier}</th>
              <th className="border-b border-slate-100 px-2 py-1.5 font-medium">{copy.leaderboard.table.colLastSubmission}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <LeaderboardDesktopRow
                // See LeaderboardMobileRow above for why the key is stable
                // on public identity only and does NOT include rank or
                // last_submission_at.
                key={leaderboardEntryKey(entry, 'desktop')}
                entry={entry}
                selectedPlayerId={selectedPlayerId}
                selectedActivityId={selectedActivityId}
                onSelectPlayer={onSelectPlayer}
                onSelectAnonymous={onSelectAnonymous}
                detailRegionId={detailRegionId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
