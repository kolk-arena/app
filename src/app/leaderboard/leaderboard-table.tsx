'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { copy } from '@/i18n';
import { formatClockSeconds, formatDateTime, formatNumber } from '@/i18n/format';
import { getFlagEmoji } from '@/lib/frontend/flag';

type LeaderboardEntry = {
  player_id: string;
  rank: number;
  display_name: string;
  handle?: string | null;
  agent_stack?: string | null;
  affiliation?: string | null;
  highest_level: number;
  best_score_on_highest: number;
  best_color_band?: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  best_quality_label?: string | null;
  solve_time_seconds?: number | null;
  efficiency_badge?: boolean;
  total_score: number;
  levels_completed: number;
  tier: string;
  pioneer?: boolean;
  last_submission_at: string | null;
  country_code?: string | null;
};

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

function formatDate(value: string | null) {
  if (!value) return copy.leaderboard.table.noSubmissionsYet;
  return formatDateTime(value, value);
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
      return 'border border-slate-200 bg-amber-50 text-amber-800';
    case 'specialist':
      return 'border border-slate-200 bg-sky-50 text-sky-800';
    case 'builder':
      return 'border border-slate-200 bg-emerald-50 text-emerald-800';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

function rankAccent(rank: number) {
  if (rank === 1) return 'memory-accent-rank';
  if (rank === 2) return 'text-slate-700 bg-slate-100 border border-slate-200';
  if (rank === 3) return 'text-orange-700 bg-orange-50 border border-slate-200';
  return 'text-slate-700 bg-white border-slate-200';
}

function LeaderboardMobileRow({
  entry,
  selectedPlayerId,
  detailPageSearch,
}: {
  entry: LeaderboardEntry;
  selectedPlayerId: string | null;
  detailPageSearch: string;
}) {
  const isUpdated = useHighlightOnChange(entry.last_submission_at);
  const isSelected = selectedPlayerId === entry.player_id;
  const t = copy.leaderboard.table;
  const affiliation = entry.affiliation;
  const agentStack = entry.agent_stack;

  return (
    <Link
      href={`/leaderboard/${entry.player_id}${detailPageSearch}`}
      className={`flex w-full flex-col gap-4 px-2 py-2 text-left transition-colors duration-1000 ${
        isUpdated
          ? 'bg-emerald-100/80'
          : isSelected
          ? 'bg-slate-100/90'
          : 'bg-white hover:bg-slate-50/80'
      }`}
      aria-label={t.openPlayerPageAriaLabel(entry.display_name)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex min-w-10 items-center justify-center rounded-md border px-2.5 py-1 ${rankAccent(entry.rank)}`}>
              {entry.rank}
            </span>
            <span className="text-sm" title={entry.country_code || t.globalCountryTooltip}>
              {getFlagEmoji(entry.country_code)}
            </span>
            <span className="text-base font-semibold text-slate-900">{entry.display_name}</span>
            {entry.pioneer ? (
              <span className="memory-accent-chip inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                {t.pioneerBadge}
              </span>
            ) : null}
            <span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tierClasses(entry.tier)}`}>
              {entry.tier}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {entry.handle ? `@${entry.handle}` : t.noPublicHandle}
          </p>
          <p className="text-xs text-slate-400">
            {affiliation ?? t.affiliationFallback}
          </p>
        </div>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          {t.viewLabel}
        </span>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.agentStackLabel}</dt>
          <dd className="mt-1 break-words font-medium text-slate-900">{agentStack ?? t.agentStackNotSet}</dd>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.affiliationLabel}</dt>
          <dd className="mt-1 break-words font-medium text-slate-900">{affiliation ?? t.affiliationFallback}</dd>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.highestLabel}</dt>
          <dd className="mt-1 font-medium text-slate-900">L{entry.highest_level}</dd>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.frontierLabel}</dt>
          <dd className="mt-1 flex items-center gap-2 font-medium text-slate-900 tabular-nums">
            <span
              aria-hidden="true"
              className={`inline-flex h-2.5 w-2.5 rounded-md ${bandDotClasses(entry.best_color_band ?? null)}`}
            />
            {formatScore(entry.best_score_on_highest)}
          </dd>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t.solveTimeLabel}</dt>
          <dd className="mt-1 font-medium text-slate-900 tabular-nums">
            {formatSolveTime(entry.solve_time_seconds)}
            {entry.efficiency_badge ? ' ⚡' : ''}
          </dd>
        </div>
      </dl>

      <p className="text-xs leading-5 text-slate-500">
        {t.lastSubmissionLabel(formatDate(entry.last_submission_at))}
      </p>
    </Link>
  );
}

function LeaderboardDesktopRow({
  entry,
  selectedPlayerId,
  onSelectPlayer,
  detailRegionId,
}: {
  entry: LeaderboardEntry;
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  detailRegionId: string;
}) {
  const isUpdated = useHighlightOnChange(entry.last_submission_at);
  const isSelected = selectedPlayerId === entry.player_id;
  const t = copy.leaderboard.table;
  const affiliation = entry.affiliation;
  const agentStack = entry.agent_stack;

  return (
    <tr
      className={`align-top transition-colors duration-1000 ${
        isUpdated
          ? 'bg-emerald-100/80'
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
        <div className="flex min-w-[14rem] max-w-[18rem] flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm" title={entry.country_code || t.globalCountryTooltip}>
              {getFlagEmoji(entry.country_code)}
            </span>
            <button
              type="button"
              onClick={() => onSelectPlayer(entry.player_id)}
              className="rounded-md break-words text-left font-semibold text-slate-900 underline-offset-4 outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-slate-300"
              aria-controls={detailRegionId}
              aria-expanded={isSelected}
              aria-label={t.openPlayerDetailAriaLabel(entry.display_name)}
            >
              {entry.display_name}
            </button>
            {entry.pioneer ? (
              <span className="memory-accent-chip inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                {t.pioneerBadge}
              </span>
            ) : null}
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              {isSelected ? t.selectedLabel : t.viewLabel}
            </span>
          </div>
          {entry.handle ? (
            <span className="text-xs text-slate-500">@{entry.handle}</span>
          ) : (
            <span className="text-xs text-slate-400">{t.noPublicHandle}</span>
          )}
          <span className="text-xs text-slate-400">{affiliation ?? t.affiliationFallback}</span>
        </div>
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5 text-slate-600">
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
              className={`inline-flex h-2.5 w-2.5 rounded-md ${bandDotClasses(entry.best_color_band ?? null)}`}
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
        <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${tierClasses(entry.tier)}`}>
          {entry.tier}
        </span>
      </td>
      <td className="border-b border-slate-100 px-2 py-1.5 text-slate-600">
        {formatDate(entry.last_submission_at)}
      </td>
    </tr>
  );
}

export function LeaderboardTable({
  entries,
  selectedPlayerId,
  onSelectPlayer,
  detailRegionId,
  detailPageSearch,
}: {
  entries: LeaderboardEntry[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  detailRegionId: string;
  detailPageSearch: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-200 md:hidden">
        {entries.map((entry) => (
          <LeaderboardMobileRow 
            key={`${entry.player_id}-${entry.rank}-${entry.last_submission_at ?? 'none'}-mobile`}
            entry={entry}
            selectedPlayerId={selectedPlayerId}
            detailPageSearch={detailPageSearch}
          />
        ))}
      </div>

      <div className="hidden max-h-[68vh] overflow-auto md:block">
        <table className="min-w-[58rem] border-collapse text-left text-sm text-slate-700 lg:min-w-full">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-100">
            <tr>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colRank}</th>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colPlayer}</th>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colAgentStack}</th>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colHighest}</th>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colFrontierScore}</th>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colSolveTime}</th>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colTier}</th>
              <th className="border-b border-slate-100 px-2 py-1.5">{copy.leaderboard.table.colLastSubmission}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <LeaderboardDesktopRow
                key={`${entry.player_id}-${entry.rank}-${entry.last_submission_at ?? 'none'}`}
                entry={entry}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={onSelectPlayer}
                detailRegionId={detailRegionId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
