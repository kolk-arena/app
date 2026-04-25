'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocalizedDateTimeFormatter } from '@/components/time/localized-time';
import { copy } from '@/i18n';
import { formatClockSeconds, formatNumber } from '@/i18n/format';
import { getFlagEmoji } from '@/lib/frontend/flag';
import { readPublicAgentFilters } from '@/lib/kolk/public-contract';
import type { ActivityFeedEntry, LeaderboardResponse as SharedLeaderboardResponse } from '@/lib/kolk/types';
import { LeaderboardTable } from './leaderboard-table';
import { PlayerDetailPanel } from './player-detail-panel';
import { ActivityDetailPanel } from './activity-detail-panel';

type LeaderboardEntry = SharedLeaderboardResponse['leaderboard'][number];

type AgentStackStat = { agent_stack: string; count: number; percentage: number };
type ActiveFilter = {
  key: 'agent_stack' | 'affiliation';
  label: string;
  value: string;
};

type LeaderboardResponse = Omit<SharedLeaderboardResponse, 'agent_stack_stats'> & {
  leaderboard: LeaderboardEntry[];
  agent_stack_stats?: AgentStackStat[];
};

const DEFAULT_LIMIT = 25;
const LEADERBOARD_POLL_MS = 30_000;
// Dropped from 15s to 5s so the live feed genuinely feels live.
// Payload is bounded (100 rows × ~220 B ≈ 22 KB) and the feed endpoint has
// an in-memory IP rate limit (30 requests/minute per IP) as a second line
// of defense against abuse.
const ACTIVITY_FEED_POLL_MS = 5_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Submission ids are uuidv4 minted at insert time (`gen_random_uuid()`), which
// always lands in the v4/variant range matched by UUID_RE above. Activity
// rows predating that guarantee are rare but possible, so the detail-panel
// loader gracefully surfaces a "not found" instead of silently breaking.

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

function formatSolveTime(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy.leaderboard.timePending;
  return formatClockSeconds(value);
}

export function LeaderboardClient() {
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = readPositiveInt(searchParams.get('page'), 1);
  const { agentStack, affiliation } = readPublicAgentFilters(searchParams);
  const limit = readPositiveInt(searchParams.get('limit'), DEFAULT_LIMIT);
  const selectedPlayerParam = searchParams.get('player');
  const selectedPlayerId = asValidPlayerId(selectedPlayerParam);
  // `?activity=<submissionId>` opens the anonymous-submission detail panel.
  // Mutually exclusive with `?player=` — `handleSelectAnonymous` clears the
  // player selection, and `handleSelectPlayer` clears the activity selection.
  const selectedActivityId = asValidPlayerId(searchParams.get('activity'));
  const activityDetailRegionId = useId();

  const currentQueryKey = JSON.stringify({
    page,
    limit,
    agentStack: agentStack ?? null,
    affiliation: affiliation ?? null,
  });
  const appliedFilterKey = JSON.stringify({
    agentStack: agentStack ?? null,
    affiliation: affiliation ?? null,
  });
  const [requestState, setRequestState] = useState<{
    queryKey: string | null;
    data: LeaderboardResponse | null;
    error: string | null;
  }>({
    queryKey: null,
    data: null,
    error: null,
  });
  const [feed, setFeed] = useState<ActivityFeedRow[]>([]);
  const [detailRetryNonce, setDetailRetryNonce] = useState(0);
  const [filterDraftState, setFilterDraftState] = useState({
    appliedFilterKey,
    agentStackInput: agentStack ?? '',
    affiliationInput: affiliation ?? '',
  });
  const [isPending, startTransition] = useTransition();
  const detailRegionId = useId();
  const activityDetailRef = useRef<HTMLDivElement | null>(null);
  const agentStackInput =
    filterDraftState.appliedFilterKey === appliedFilterKey
      ? filterDraftState.agentStackInput
      : (agentStack ?? '');
  const affiliationInput =
    filterDraftState.appliedFilterKey === appliedFilterKey
      ? filterDraftState.affiliationInput
      : (affiliation ?? '');
  const loading = requestState.queryKey !== currentQueryKey;
  const data = requestState.data;
  const error = requestState.queryKey === currentQueryKey ? requestState.error : null;
  const selectionMessage =
    selectedPlayerParam && !selectedPlayerId
      ? copy.leaderboard.selectionInvalid
      : null;
  const formatUpdatedLabel = (value: string | null) =>
    value
      ? formatLocalDateTime(value, value)
      : copy.leaderboard.noRecentSubmissionData;

  useEffect(() => {
    if (!selectedActivityId || selectedPlayerId) return;
    if (typeof window === 'undefined' || window.innerWidth >= 1280) return;
    const timeoutId = window.setTimeout(() => {
      activityDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [selectedActivityId, selectedPlayerId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const apiQuery = buildQueryString(new URLSearchParams(), {
      page: String(page),
      limit: String(limit),
      agent_stack: agentStack || null,
      affiliation: affiliation || null,
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
          setRequestState({
            queryKey: currentQueryKey,
            data: payload,
            error: null,
          });
        })
        .catch((err: unknown) => {
          if (!active || controller.signal.aborted) return;
          setRequestState({
            queryKey: currentQueryKey,
            data: null,
            error: err instanceof Error ? err.message : copy.leaderboard.failedToLoad,
          });
        });
    };

    fetchLeaderboard();

    // The leaderboard payload is materially heavier than the live activity
    // feed, so it refreshes more conservatively. Background tabs are also
    // skipped to protect Vercel + Supabase quota.
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchLeaderboard();
    }, LEADERBOARD_POLL_MS);

    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [page, agentStack, affiliation, limit, currentQueryKey]);

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
    // Keep the community feed feeling live while leaving the heavier standings
    // query on a slower cadence. Server also has an in-memory IP rate limit
    // (src/app/api/activity-feed/route.ts) as a belt-and-suspenders defence
    // against abuse.
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchFeed();
    }, ACTIVITY_FEED_POLL_MS);
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
  const selectedPlayerOnPage = entries.some((entry) => entry.player_id != null && entry.player_id === selectedPlayerId);
  const detailPageSearch = buildQueryString(new URLSearchParams(searchParams.toString()), {
    player: null,
  });
  const lb = copy.leaderboard;
  const activeFilters: ActiveFilter[] = [];

  if (agentStack) {
    activeFilters.push({
      key: 'agent_stack',
      label: lb.activeFilterAgentStack,
      value: agentStack,
    });
  }

  if (affiliation) {
    activeFilters.push({
      key: 'affiliation',
      label: lb.activeFilterAffiliation,
      value: affiliation,
    });
  }

  function navigate(updates: Record<string, string | null>) {
    startTransition(() => {
      const query = buildQueryString(new URLSearchParams(searchParams.toString()), updates);
      router.replace(`${pathname}${query}`, { scroll: false });
    });
  }

  function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({
      agent_stack: agentStackInput.trim() || null,
      affiliation: affiliationInput.trim() || null,
      page: '1',
    });
  }

  function clearFilters() {
    setFilterDraftState({
      appliedFilterKey,
      agentStackInput: '',
      affiliationInput: '',
    });
    navigate({
      agent_stack: null,
      affiliation: null,
      page: '1',
    });
  }

  function clearSelectedPlayer() {
    navigate({
      player: null,
    });
  }

  function retrySelectedPlayer() {
    if (!selectedPlayerId) return;
    setDetailRetryNonce((current) => current + 1);
  }

  function handleSelectAnonymous(submissionId: string) {
    navigate({
      activity: submissionId,
      player: null,
    });
  }

  function clearSelectedActivity() {
    navigate({
      activity: null,
    });
  }

  function clearSingleFilter(filterKey: 'agent_stack' | 'affiliation') {
    if (filterKey === 'agent_stack') {
      setFilterDraftState({
        appliedFilterKey,
        agentStackInput: '',
        affiliationInput,
      });
      navigate({
        agent_stack: null,
        page: '1',
      });
      return;
    }

    setFilterDraftState({
      appliedFilterKey,
      agentStackInput,
      affiliationInput: '',
    });
    navigate({
      affiliation: null,
      page: '1',
    });
  }

  function handleSelectPlayer(playerId: string) {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      router.push(`/leaderboard/${playerId}`);
      return;
    }

    navigate({
      player: playerId,
      activity: null,
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-2 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
                  {lb.heroEyebrow}
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{lb.heroTitle}</h1>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    {lb.heroDescription}
                  </p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    {copy.home.liveRankings.publicRule}
                  </p>
                </div>
              </div>

            <div className="grid w-full gap-3 sm:w-auto sm:min-w-[15rem] sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                <p className="text-xs font-medium text-slate-500">{lb.entriesEyebrow}</p>
                <p className="mt-2 inline-block rounded-xl border border-slate-200 bg-white px-3 py-1 text-3xl font-semibold tabular-nums text-slate-950 shadow-sm">{total}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                <p className="text-xs font-medium text-slate-500">{lb.currentLeaderEyebrow}</p>
                <p className="mt-2 inline-block max-w-full truncate rounded-xl border border-slate-200 bg-white px-3 py-1 text-xl font-semibold tracking-tight text-slate-950 shadow-sm">
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm sm:col-span-2">
                <p className="text-xs font-medium text-slate-500">{lb.leaderboardRuleEyebrow}</p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {lb.leaderboardRuleBody}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {lb.topTierLabel(topTier)}
                </p>
              </div>
            </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <form onSubmit={handleFilterSubmit} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-500">{lb.agentStackFilter}</span>
                  <input
                    value={agentStackInput}
                    onChange={(event) => setFilterDraftState({
                      appliedFilterKey,
                      agentStackInput: event.target.value,
                      affiliationInput,
                    })}
                    placeholder={lb.agentStackPlaceholder}
                    className="focus-gentle min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition sm:text-sm"
                  />
                </label>

                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-500">{lb.affiliationFilter}</span>
                  <input
                    value={affiliationInput}
                    onChange={(event) => setFilterDraftState({
                      appliedFilterKey,
                      agentStackInput,
                      affiliationInput: event.target.value,
                    })}
                    placeholder={lb.affiliationPlaceholder}
                    className="focus-gentle min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition sm:text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
                  <button
                    type="submit"
                    className="focus-gentle min-h-11 rounded-xl border border-slate-200 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    disabled={isPending}
                  >
                    {lb.applyFilter}
                  </button>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="focus-gentle min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {lb.clearFilter}
                  </button>
                </div>
              </form>

              {activeFilters.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    {lb.activeFilterEyebrow}
                  </span>
                  {activeFilters.map((filter) => (
                    <span
                      key={filter.key}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
                    >
                      <span className="text-slate-500">{filter.label}:</span>
                      <span>{filter.value}</span>
                      <button
                        type="button"
                        onClick={() => clearSingleFilter(filter.key)}
                        className="focus-gentle min-h-11 rounded-xl px-2 text-slate-500 hover:text-slate-900"
                      >
                        {lb.clearFilter}
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {data?.agent_stack_stats && data.agent_stack_stats.length > 0 ? (
                <details className="rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-900">
                    {lb.agentStackMix.title}
                  </summary>
                  <div className="border-t border-slate-200 px-4 py-4">
                    <div className="flex h-3.5 w-full overflow-hidden rounded-full border border-slate-200 bg-white">
                      {data.agent_stack_stats.map((stat, idx) => {
                        const bgColors = ['bg-slate-950', 'bg-slate-700', 'bg-slate-500', 'bg-slate-400', 'bg-slate-300'];
                        return (
                          <div
                            key={stat.agent_stack}
                            style={{ width: `${stat.percentage}%` }}
                            className={`${bgColors[idx % bgColors.length]} transition-all duration-500`}
                            title={`${stat.agent_stack}: ${stat.count}`}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
                      {data.agent_stack_stats.map((stat, idx) => {
                        const dotColors = ['bg-slate-950', 'bg-slate-700', 'bg-slate-500', 'bg-slate-400', 'bg-slate-300'];
                        return (
                          <div key={stat.agent_stack} className="flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-md ${dotColors[idx % dotColors.length]}`} />
                            <span className="font-medium text-slate-700">{stat.agent_stack}</span>
                            <span className="text-slate-400">({lb.agentStackMix.legendPercent(stat.percentage)})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </details>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
              <p className="text-xs font-medium text-slate-500">{lb.viewEyebrow}</p>
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
          <div className="rounded-xl border border-slate-200 bg-rose-50 px-5 py-4 text-sm text-rose-900 shadow-sm">
            <p className="font-semibold">{lb.failedToLoad}</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        {!error && selectionMessage ? (
          <div className="rounded-xl border border-slate-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{lb.selectionUnavailableTitle}</p>
                <p className="mt-1">{selectionMessage}</p>
              </div>
              <button
                type="button"
                onClick={clearSelectedPlayer}
                className="focus-gentle inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
              >
                {lb.clearSelection}
              </button>
            </div>
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{lb.standingsTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {lb.standingsSubtitle}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 xl:inline-flex">
                  {lb.listPlusDetail}
                </span>
                {isPending || loading ? (
                  <span className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
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
                  {activeFilters.length > 0 ? lb.noEntriesFilteredHint : lb.noEntriesDefaultHint}
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
                  detailPageSearch={detailPageSearch}
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
                      className="focus-gentle min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {lb.previousPage}
                    </button>
                    <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-700">
                      {lb.pageLabel(page, pageCount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate({ page: String(page + 1) })}
                      disabled={page >= pageCount || isPending}
                      className="focus-gentle min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {lb.nextPage}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-auto space-y-4">
            <PlayerDetailPanel
              key={`${selectedPlayerId ?? 'no-player-selected'}-${detailRetryNonce}`}
              playerId={selectedPlayerId}
              onClear={clearSelectedPlayer}
              onRetry={retrySelectedPlayer}
              panelId={detailRegionId}
              detailPageSearch={detailPageSearch}
              outsideCurrentView={!loading && Boolean(selectedPlayerId) && !selectedPlayerOnPage && !selectionMessage}
            />

            {selectedActivityId && !selectedPlayerId ? (
              <div ref={activityDetailRef}>
                <ActivityDetailPanel
                  submissionId={selectedActivityId}
                  onClear={clearSelectedActivity}
                  panelId={activityDetailRegionId}
                  detailPageSearch={detailPageSearch}
                />
              </div>
            ) : null}

            <section
              aria-label={lb.activityFeed.title}
              className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col max-h-[600px]"
            >
              <div className="border-b border-slate-200 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-md bg-slate-900 animate-pulse" />
                  <h3 className="text-sm font-semibold text-slate-900">{lb.activityFeed.title}</h3>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {lb.activityFeed.liveBadge}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">{lb.activityFeed.filterAllTiers}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {feed.length > 0 ? (
                  <ul aria-live="polite" className="space-y-2">
                    {feed.map((f: ActivityFeedRow) => (
                      <li key={f.id}>
                        <ActivityFeedItem
                          row={f}
                          detailPageSearch={detailPageSearch}
                          onSelectAnonymous={handleSelectAnonymous}
                          isSelected={f.id === selectedActivityId}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div aria-live="polite" className="text-xs text-slate-500">
                    {lb.activityFeed.listeningSubmissions}
                  </div>
                )}
              </div>
            </section>
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
type ActivityFeedRow = Pick<
  ActivityFeedEntry,
  'id' | 'player_id' | 'display_name' | 'agent_stack' | 'level' | 'unlocked' | 'submitted_at' | 'country_code' | 'is_anon'
>;

/**
 * Render a single activity-feed row.
 *
 * Built as a JSX render helper rather than a `String.replace` template so
 * other locales can re-order subject / verb / object cleanly. The verb is
 * pulled from `copy.leaderboard.activityFeed` so future locales translate
 * "just passed" / "just attempted" / " using " independently.
 */
function ActivityFeedItem({
  row,
  detailPageSearch,
  onSelectAnonymous,
  isSelected,
}: {
  row: ActivityFeedRow;
  detailPageSearch: string;
  onSelectAnonymous: (submissionId: string) => void;
  isSelected: boolean;
}) {
  const af = copy.leaderboard.activityFeed;
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
  const submittedLabel = row.submitted_at
    ? formatLocalDateTime(row.submitted_at, row.submitted_at)
    : copy.leaderboard.noRecentSubmissionData;
  const verb = row.unlocked ? af.rowVerbPassed : af.rowVerbAttempted;
  const flag = row.country_code ? (
    <span
      aria-hidden="true"
      className="mr-1 text-base leading-none"
      title={row.country_code}
    >
      {getFlagEmoji(row.country_code)}
    </span>
  ) : null;
  const content = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-1">
        {flag}
        <span className="font-semibold text-slate-900">{row.display_name}</span>{' '}
        <span>{verb}</span>{' '}
        <span className="font-semibold text-slate-900 tabular-nums">L{row.level}</span>
        {row.agent_stack ? (
          <span className="text-slate-500">
            {af.usingAgentStackPrefix}
            {row.agent_stack}
          </span>
        ) : null}
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
        {submittedLabel}
      </div>
    </>
  );

  // Anonymous rows open the inline ActivityDetailPanel via `?activity=<id>`.
  // Registered rows link out to the full player page as before.
  if (row.is_anon === true || !row.player_id) {
    return (
      <button
        type="button"
        onClick={() => onSelectAnonymous(row.id)}
        aria-pressed={isSelected}
        className={`block w-full rounded-xl border px-3 py-2 text-left text-sm text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${
          isSelected
            ? 'border-slate-300 bg-slate-100'
            : row.unlocked
            ? 'border-slate-200 border-l-2 border-l-slate-900 bg-white'
            : 'border-slate-200 bg-white'
        }`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={`/leaderboard/${row.player_id}${detailPageSearch}`}
      className={`block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white ${
        row.unlocked ? 'border-l-2 border-l-slate-900' : ''
      }`}
    >
      {content}
    </Link>
  );
}
