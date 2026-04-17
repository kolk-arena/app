'use client';

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

function formatScore(value: number) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'No submissions yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatSolveTime(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'specialist':
      return 'border-sky-200 bg-sky-50 text-sky-800';
    case 'builder':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

function rankAccent(rank: number) {
  if (rank === 1) return 'text-amber-700 bg-amber-50 border-amber-200';
  if (rank === 2) return 'text-slate-700 bg-slate-100 border-slate-300';
  if (rank === 3) return 'text-orange-700 bg-orange-50 border-orange-200';
  return 'text-slate-700 bg-white border-slate-200';
}

export function LeaderboardTable({
  entries,
  selectedPlayerId,
  onSelectPlayer,
  detailRegionId,
}: {
  entries: LeaderboardEntry[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  detailRegionId: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="divide-y divide-slate-200 md:hidden">
        {entries.map((entry) => (
          <button
            key={`${entry.player_id}-${entry.rank}-${entry.last_submission_at ?? 'none'}-mobile`}
            type="button"
            className={`flex w-full flex-col gap-4 px-4 py-4 text-left transition ${
              selectedPlayerId === entry.player_id ? 'bg-slate-100/90' : 'bg-white hover:bg-slate-50/80'
            }`}
            onClick={() => onSelectPlayer(entry.player_id)}
            aria-label={`Open player page for ${entry.display_name}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex min-w-10 items-center justify-center rounded-md border px-2.5 py-1 ${rankAccent(entry.rank)}`}>
                    {entry.rank}
                  </span>
                  <span className="text-base font-semibold text-slate-950">{entry.display_name}</span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tierClasses(entry.tier)}`}>
                    {entry.tier}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {entry.handle ? `@${entry.handle}` : 'No public handle'}
                </p>
                <p className="text-xs text-slate-400">
                  {entry.framework ?? 'Framework not set'}
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                View
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">School</dt>
                <dd className="mt-1 break-words font-medium text-slate-900">{entry.school ?? 'Independent'}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Highest</dt>
                <dd className="mt-1 font-medium text-slate-900">L{entry.highest_level}</dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Frontier</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium text-slate-900">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-2.5 w-2.5 rounded-full ${bandDotClasses(entry.best_color_band ?? null)}`}
                  />
                  {formatScore(entry.best_score_on_highest)}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Solve Time</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {formatSolveTime(entry.solve_time_seconds)}
                  {entry.efficiency_badge ? ' ⚡' : ''}
                </dd>
              </div>
            </dl>

            <p className="text-xs leading-5 text-slate-500">
              Last submission: {formatDate(entry.last_submission_at)}
            </p>
          </button>
        ))}
      </div>

      <div className="hidden max-h-[68vh] overflow-auto md:block">
        <table className="min-w-[58rem] border-collapse text-left text-sm text-slate-700 lg:min-w-full">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)]">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Rank</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Player</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">School</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Highest</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Frontier Score</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Solve Time</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Tier</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Last Submission</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={`${entry.player_id}-${entry.rank}-${entry.last_submission_at ?? 'none'}`}
                className={`align-top transition ${
                  selectedPlayerId === entry.player_id ? 'bg-slate-100/90' : 'hover:bg-slate-50/80'
                }`}
                aria-selected={selectedPlayerId === entry.player_id}
              >
                <td className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">
                  <span className={`inline-flex min-w-10 items-center justify-center rounded-md border px-2.5 py-1 ${rankAccent(entry.rank)}`}>
                    {entry.rank}
                  </span>
                </td>
                <td className="border-b border-slate-200 px-4 py-3">
                  <div className="flex min-w-[14rem] max-w-[18rem] flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(entry.player_id)}
                        className="rounded-sm break-words text-left font-semibold text-slate-950 underline-offset-4 outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-slate-300"
                        aria-controls={detailRegionId}
                        aria-expanded={selectedPlayerId === entry.player_id}
                        aria-label={`Open player detail for ${entry.display_name}`}
                      >
                        {entry.display_name}
                      </button>
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {selectedPlayerId === entry.player_id ? 'Selected' : 'View'}
                      </span>
                    </div>
                    {entry.handle ? (
                      <span className="text-xs text-slate-500">@{entry.handle}</span>
                    ) : (
                      <span className="text-xs text-slate-400">No public handle</span>
                    )}
                    <span className="text-xs text-slate-400">{entry.framework ?? 'Framework not set'}</span>
                  </div>
                </td>
                <td className="border-b border-slate-200 px-4 py-3 text-slate-600">
                  {entry.school ?? 'Independent'}
                </td>
                <td className="border-b border-slate-200 px-4 py-3">
                  <span className="inline-flex min-w-14 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-800">
                    L{entry.highest_level}
                  </span>
                </td>
                <td className="border-b border-slate-200 px-4 py-3 font-medium text-slate-950">
                  <div className="flex flex-col gap-1">
                    <span>{formatScore(entry.best_score_on_highest)}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-2.5 w-2.5 rounded-full ${bandDotClasses(entry.best_color_band ?? null)}`}
                      />
                      {entry.best_quality_label ?? 'frontier'}
                    </span>
                  </div>
                </td>
                <td className="border-b border-slate-200 px-4 py-3 font-medium text-slate-950">
                  <div className="flex flex-col gap-1">
                    <span>{formatSolveTime(entry.solve_time_seconds)}</span>
                    <span className="text-xs text-slate-400">
                      {entry.efficiency_badge ? 'efficiency badge' : 'time tie-break'}
                    </span>
                  </div>
                </td>
                <td className="border-b border-slate-200 px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${tierClasses(entry.tier)}`}>
                    {entry.tier}
                  </span>
                </td>
                <td className="border-b border-slate-200 px-4 py-3 text-slate-600">
                  {formatDate(entry.last_submission_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
