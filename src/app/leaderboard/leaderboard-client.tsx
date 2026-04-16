'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LeaderboardTable } from './leaderboard-table';
import { PlayerDetailPanel } from './player-detail-panel';

type LeaderboardEntry = {
  player_id: string;
  rank: number;
  display_name: string;
  handle?: string | null;
  school: string | null;
  highest_level: number;
  best_score_on_highest: number;
  total_score: number;
  tier: string;
  last_submission_at: string | null;
};

type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
};

const DEFAULT_LIMIT = 25;
const QUICK_SCHOOLS = ['TecMilenio', 'UNAM', 'IPN'];
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
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatUpdatedLabel(value: string | null) {
  if (!value) return 'No recent submission data';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function LeaderboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = readPositiveInt(searchParams.get('page'), 1);
  const school = searchParams.get('school') ?? '';
  const limit = readPositiveInt(searchParams.get('limit'), DEFAULT_LIMIT);
  const selectedPlayerId = asValidPlayerId(searchParams.get('player'));

  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [detailRetryNonce, setDetailRetryNonce] = useState(0);
  const [schoolInput, setSchoolInput] = useState(school);
  const [isPending, startTransition] = useTransition();
  const detailRegionId = useId();

  useEffect(() => {
    setSchoolInput(school);
  }, [school]);

  useEffect(() => {
    const rawPlayerId = searchParams.get('player');
    if (!rawPlayerId) {
      setSelectionMessage(null);
      return;
    }
    if (selectedPlayerId) return;
    setSelectionMessage('The selected player link is invalid.');
  }, [searchParams, selectedPlayerId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const apiQuery = buildQueryString(new URLSearchParams(), {
      page: String(page),
      limit: String(limit),
      school: school || null,
    });

    void fetch(`/api/leaderboard${apiQuery}`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as LeaderboardResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load leaderboard');
        }
        if (!active) return;
        setData(payload);
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [page, school, limit]);

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
      school: schoolInput.trim() || null,
      page: '1',
      player: null,
    });
  }

  function clearFilters() {
    setSchoolInput('');
    setSelectionMessage(null);
    navigate({
      school: null,
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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Live Rankings
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Leaderboard</h1>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    Public standings for Kolk Arena. Progression comes first, frontier performance breaks ties, and recent activity stays visible.
                  </p>
                </div>
              </div>

              <div className="grid w-full gap-3 sm:w-auto sm:min-w-[15rem] sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Entries</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{total}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current Leader</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950">
                    {topEntry ? topEntry.display_name : 'No entries yet'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {topEntry ? `L${topEntry.highest_level} · ${formatScore(topEntry.best_score_on_highest)}` : 'Waiting for first official result'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Leaderboard Rule</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    Highest level first. Frontier score breaks ties.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Current top tier: {topTier}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <form onSubmit={handleFilterSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">School Filter</span>
                  <input
                    value={schoolInput}
                    onChange={(event) => setSchoolInput(event.target.value)}
                    placeholder="TecMilenio"
                    className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
                  <button
                    type="submit"
                    className="min-h-12 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    disabled={isPending}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate({ school: null, page: '1', player: null })}
                    className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      school
                        ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-slate-900 bg-slate-900 text-white'
                  }`}
                >
                  All schools
                </button>
                {QUICK_SCHOOLS.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => navigate({ school: candidate, page: '1', player: null })}
                    className={`min-h-10 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      school === candidate
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {candidate}
                  </button>
                ))}
              </div>

              {school ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Active filter
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <span>{school}</span>
                    <button type="button" onClick={clearFilters} className="min-h-7 text-emerald-700 hover:text-emerald-900">
                      Clear
                    </button>
                  </span>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">View</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {showingFrom}-{showingTo} of {total}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Sorted by highest level, then best frontier score, then earlier submission time.
              </p>
              {selectedPlayerId ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Detail selection is stored in the URL and survives refresh.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900 shadow-sm">
            <p className="font-semibold">Failed to load leaderboard</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        {!error && selectionMessage ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Selection unavailable</p>
                <p className="mt-1">{selectionMessage}</p>
              </div>
              <button
                type="button"
                onClick={clearSelectedPlayer}
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800 transition hover:bg-amber-100"
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Standings</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Dense, audit-friendly view of public competitive results.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 xl:inline-flex">
                  List + detail
                </span>
                {isPending || loading ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Refreshing
                  </span>
                ) : null}
              </div>
            </div>

            {loading && !data ? (
              <div className="px-5 py-10 text-sm text-slate-500 sm:px-6">Loading leaderboard...</div>
            ) : null}

            {!loading && !error && entries.length === 0 ? (
              <div className="px-5 py-10 sm:px-6">
                <p className="text-sm font-semibold text-slate-900">No entries found.</p>
                <p className="mt-1 text-sm text-slate-500">
                  {school ? 'Try clearing the school filter or check back after more submissions land.' : 'Official competitive entries will appear here once players start posting passing runs.'}
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
                    {topEntry ? `Leader updated ${formatUpdatedLabel(topEntry.last_submission_at)}.` : 'No leader yet.'}
                  </p>

                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      onClick={() => navigate({ page: String(page - 1) })}
                      disabled={page <= 1 || isPending}
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-700">
                      Page {page} / {pageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate({ page: String(page + 1) })}
                      disabled={page >= pageCount || isPending}
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-auto">
            {!loading && selectedPlayerId && !selectedPlayerOnPage && !selectionMessage ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
                <p className="font-semibold">Selected player is outside the current list view.</p>
                <p className="mt-1">
                  The detail panel stays open, but the selected row is not on this page or does not match the current filter.
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
          </div>
        </section>
      </section>
    </main>
  );
}
