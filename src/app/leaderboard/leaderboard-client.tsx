'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { copy } from '@/i18n';
import { formatClockSeconds, formatDateTime, formatNumber } from '@/i18n/format';
import { LeaderboardTable } from './leaderboard-table';
import { PlayerDetailPanel } from './player-detail-panel';

type LeaderboardEntry = {
  player_id: string;
  rank: number;
  display_name: string;
  handle?: string | null;
  framework?: string | null;
  school: string | null;
  highest_level: number;
  best_score_on_highest: number;
  best_color_band?: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  best_quality_label?: string | null;
  solve_time_seconds?: number | null;
  efficiency_badge?: boolean;
  total_score: number;
  tier: string;
  last_submission_at: string | null;
};

type FrameworkStat = { framework: string; count: number; percentage: number };

type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  framework_stats?: FrameworkStat[];
};

const DEFAULT_LIMIT = 25;
const QUICK_FRAMEWORKS = ['Claude Code', 'Cursor', 'Windsurf', 'OpenHands', 'LangGraph', 'Custom'];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readPositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function asValidPlayerId(value: string | null) {
  if (!value) return null;
  return UUID_RE.test(value) ? value : null;
}

function buildQueryString(params: URLSearchParams, updates: Record<string, string | null>) {
  const next = new URLSearchParams(params);

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query ? `?${query}` : '';
}

function formatScore(value: number) {
  return formatNumber(value, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatUpdatedLabel(value: string | null) {
  if (!value) return copy.leaderboard.noRecentSubmissionData;
  return formatDateTime(value, value);
}

function formatSolveTime(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy.leaderboard.timePending;
  return formatClockSeconds(value);
}

export function LeaderboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = readPositiveInt(searchParams.get('page'), 1);
  const framework = searchParams.get('framework') ?? '';
  const limit = readPositiveInt(searchParams.get('limit'), DEFAULT_LIMIT);
  const selectedPlayerId = asValidPlayerId(searchParams.get('player'));

  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [feed, setFeed] = useState<ActivityFeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [detailRetryNonce, setDetailRetryNonce] = useState(0);
  const [frameworkInput, setFrameworkInput] = useState(framework);
  const [isPending, startTransition] = useTransition();
  const detailRegionId = useId();

  useEffect(() => {
    setFrameworkInput(framework);
  }, [framework]);

  useEffect(() => {
    const rawPlayerId = searchParams.get('player');
    if (!rawPlayerId) {
      setSelectionMessage(null);
      return;
    }
    if (selectedPlayerId) return;
    setSelectionMessage(copy.leaderboard.selectionInvalid);
  }, [searchParams, selectedPlayerId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const apiQuery = buildQueryString(new URLSearchParams(), {
      page: String(page),
      limit: String(limit),
      framework: framework || null,
    });

    const fetchLeaderboard = () => {
      fetch(`/api/leaderboard${apiQuery}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as LeaderboardResponse & { error?: string };
          if (!response.ok) {
            throw new Error(payload.error ?? copy.leaderboard.failedToLoad);
          }
          if (!active) return;
          setData(payload);
        })
        .catch((err: unknown) => {
          if (!active || controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : copy.leaderboard.failedToLoad);
          setData(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    fetchLeaderboard();

    // Poll every 30s, skipping hidden tabs so background tabs do not drive
    // Vercel + Supabase quota. See `docs/FRONTEND_BETA_STATES` for rationale.
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchLeaderboard();
    }, 30000);

    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [page, framework, limit]);

  useEffect(() => {
    let active = true;
    const fetchFeed = async () => {
      try {
        const res = await fetch('/api/activity-feed', { cache: 'no-store' });
        if (!res.ok) return;
        const payload = await res.json();
        if (active && payload.feed) {
          setFeed(payload.feed);
        }
      } catch {
        // Silently ignore — feed is best-effort and the next poll will retry.
      }
    };
    fetchFeed();
    // 30s polling + skip hidden tabs. Server also has an in-memory IP rate
    // limit (src/app/api/activity-feed/route.ts) as a belt-and-suspenders
    // defence against abuse.
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchFeed();
    }, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const entries = data?.leaderboard ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const showingFrom = total === 0 ? 0 : (page - 1) * limit + 1;
  const showingTo = total === 0 ? 0 : Math.min(total, (page - 1) * limit + entries.length);
  const topEntry = entries[0] ?? null;
  const topTier = topEntry?.tier ?? 'starter';
  const selectedPlayerOnPage = entries.some((entry) => entry.player_id === selectedPlayerId);

  function navigate(updates: Record<string, string | null>) {
    startTransition(() => {
      const query = buildQueryString(new URLSearchParams(searchParams.toString()), updates);
      router.replace(`${pathname}${query}`, { scroll: false });
    });
  }

  function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectionMessage(null);
    navigate({
      framework: frameworkInput.trim() || null,
      page: '1',
      player: null,
    });
  }

  function clearFilters() {
    setFrameworkInput('');
    setSelectionMessage(null);
    navigate({
      framework: null,
      page: '1',
      player: null,
    });
  }

  function clearSelectedPlayer() {
    setSelectionMessage(null);
    navigate({
      player: null,
    });
  }

  function retrySelectedPlayer() {
    if (!selectedPlayerId) return;
    setSelectionMessage(null);
    setDetailRetryNonce((current) => current + 1);
  }

  function handleSelectPlayer(playerId: string) {
    setSelectionMessage(null);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      router.push(`/leaderboard/${playerId}`);
      return;
    }

    navigate({
      player: playerId,
    });
  }

  const lb = copy.leaderboard;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {lb.heroEyebrow}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{lb.heroTitle}</h1>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    {lb.heroDescription}
                  </p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    {copy.home.liveRankings.publicRule}
                  </p>
                </div>
              </div>

            <div className="grid w-full gap-3 sm:w-auto sm:min-w-[15rem] sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{lb.entriesEyebrow}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{total}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{lb.currentLeaderEyebrow}</p>
                <p className="mt-2 truncate text-sm font-semibold text-slate-950">
                  {topEntry ? topEntry.display_name : lb.currentLeaderEmpty}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {topEntry
                    ? lb.currentLeaderSummary(
                        topEntry.highest_level,
                        formatScore(topEntry.best_score_on_highest),
                        formatSolveTime(topEntry.solve_time_seconds),
                      )
                    : lb.currentLeaderEmpty}
                </p>
              </div>
              {data?.framework_stats && data.framework_stats.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 sm:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{lb.frameworkWars.title}</p>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    {data.framework_stats.map((stat, idx) => {
                      const bgColors = ['bg-emerald-500', 'bg-sky-500', 'bg-indigo-500', 'bg-amber-500', 'bg-rose-500'];
                      return (
                        <div
                          key={stat.framework}
                          style={{ width: `${stat.percentage}%` }}
                          className={`${bgColors[idx % bgColors.length]} transition-all duration-500`}
                          title={`${stat.framework}: ${stat.count}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
                    {data.framework_stats.map((stat, idx) => {
                      const textColors = ['text-emerald-700', 'text-sky-700', 'text-indigo-700', 'text-amber-700', 'text-rose-700'];
                      return (
                        <div key={stat.framework} className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full bg-current ${textColors[idx % textColors.length]}`} />
                          <span className="font-medium">{stat.framework}</span>
                          <span className="text-slate-400">({lb.frameworkWars.legendPercent(stat.percentage)})</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{lb.leaderboardRuleEyebrow}</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {lb.leaderboardRuleBody}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {lb.topTierLabel(topTier)}
                  </p>
                </div>
              )}
            </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <form onSubmit={handleFilterSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{lb.frameworkFilter}</span>
                  <input
                    value={frameworkInput}
                    onChange={(event) => setFrameworkInput(event.target.value)}
                    placeholder={lb.frameworkPlaceholder}
                    className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
                  <button
                    type="submit"
                    className="min-h-12 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    disabled={isPending}
                  >
                    {lb.applyFilter}
                  </button>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {lb.clearFilter}
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate({ framework: null, page: '1', player: null })}
                    className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      framework
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-slate-900 bg-slate-900 text-white'
                  }`}
                >
                  {lb.allFrameworks}
                </button>
                {QUICK_FRAMEWORKS.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => navigate({ framework: candidate, page: '1', player: null })}
                    className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      framework === candidate
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {candidate}
                  </button>
                ))}
              </div>

              {framework ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {lb.activeFilterEyebrow}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <span>{framework}</span>
                    <button type="button" onClick={clearFilters} className="min-h-7 text-emerald-700 hover:text-emerald-900">
                      {lb.clearFilter}
                    </button>
                  </span>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{lb.viewEyebrow}</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {lb.showingLabel(showingFrom, showingTo, total)}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {lb.sortExplainer}
              </p>
              {selectedPlayerId ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {lb.detailSelectionStorage}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900 shadow-sm">
            <p className="font-semibold">{lb.failedToLoad}</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        {!error && selectionMessage ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{lb.selectionUnavailableTitle}</p>
                <p className="mt-1">{selectionMessage}</p>
              </div>
              <button
                type="button"
                onClick={clearSelectedPlayer}
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800 transition hover:bg-amber-100"
              >
                {lb.clearSelection}
              </button>
            </div>
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-semibold text-slate-950">{lb.standingsTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {lb.standingsSubtitle}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 xl:inline-flex">
                  {lb.listPlusDetail}
                </span>
                {isPending || loading ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {lb.refreshing}
                  </span>
                ) : null}
              </div>
            </div>

            {loading && !data ? (
              <div className="px-5 py-10 text-sm text-slate-500 sm:px-6">{lb.loading}</div>
            ) : null}

            {!loading && !error && entries.length === 0 ? (
              <div className="px-5 py-10 sm:px-6">
                <p className="text-sm font-semibold text-slate-900">{lb.noEntriesTitle}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {framework ? lb.noEntriesFrameworkHint : lb.noEntriesDefaultHint}
                </p>
              </div>
            ) : null}

            {entries.length > 0 ? (
              <>
                <LeaderboardTable
                  entries={entries}
                  selectedPlayerId={selectedPlayerId}
                  onSelectPlayer={handleSelectPlayer}
                  detailRegionId={detailRegionId}
                />

              <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                  <p className="text-sm text-slate-500">
                    {topEntry ? lb.leaderUpdatedPrefix(formatUpdatedLabel(topEntry.last_submission_at)) : lb.noLeaderYet}
                  </p>

                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      onClick={() => navigate({ page: String(page - 1) })}
                      disabled={page <= 1 || isPending}
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {lb.previousPage}
                    </button>
                    <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-700">
                      {lb.pageLabel(page, pageCount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate({ page: String(page + 1) })}
                      disabled={page >= pageCount || isPending}
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {lb.nextPage}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-auto space-y-4">
            {!loading && selectedPlayerId && !selectedPlayerOnPage && !selectionMessage ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
                <p className="font-semibold">{lb.detailOutsideViewTitle}</p>
                <p className="mt-1">
                  {lb.detailOutsideViewBody}
                </p>
              </div>
            ) : null}
            <PlayerDetailPanel
              key={`${selectedPlayerId ?? 'no-player-selected'}-${detailRetryNonce}`}
              playerId={selectedPlayerId}
              onClear={clearSelectedPlayer}
              onRetry={retrySelectedPlayer}
              panelId={detailRegionId}
            />

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col max-h-80">
              <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-sm font-semibold text-slate-900">{lb.activityFeed.title}</h3>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">{lb.activityFeed.filterAllTiers}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {feed.map((f: ActivityFeedRow) => (
                  <ActivityFeedItem key={f.id} row={f} />
                ))}
                {feed.length === 0 && <div className="text-xs text-slate-500">{lb.activityFeed.listeningSubmissions}</div>}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

/**
 * Activity-feed row shape (mirrors the columns selected by
 * `src/app/api/activity-feed/route.ts`). Kept narrow on purpose — the row only
 * needs the keys the UI renders. New keys land here when the API adds them.
 */
type ActivityFeedRow = {
  id: string;
  display_name: string;
  framework?: string | null;
  level: number;
  unlocked: boolean;
  submitted_at: string | null;
};

/**
 * Render a single activity-feed row.
 *
 * Built as a JSX render helper rather than a `String.replace` template so
 * other locales can re-order subject / verb / object cleanly. The verb is
 * pulled from `copy.leaderboard.activityFeed` so future locales translate
 * "just passed" / "just attempted" / " using " independently.
 */
function ActivityFeedItem({ row }: { row: ActivityFeedRow }) {
  const af = copy.leaderboard.activityFeed;
  const verb = row.unlocked ? af.rowVerbPassed : af.rowVerbAttempted;
  return (
    <div
      className={`text-sm text-slate-600 border-l-2 ${row.unlocked ? 'border-emerald-200' : 'border-slate-200'} pl-3 py-0.5`}
    >
      <span className="font-semibold text-slate-900">{row.display_name}</span> {verb}{' '}
      <span className="font-semibold text-slate-900">L{row.level}</span>
      {row.framework ? (
        <span>
          {af.usingFrameworkPrefix}
          {row.framework}
        </span>
      ) : null}
      <div className="text-[10px] text-slate-400 mt-0.5">{formatUpdatedLabel(row.submitted_at)}</div>
    </div>
  );
}
