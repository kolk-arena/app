import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import { formatDateTime, formatNumber } from '@/i18n/format';
import { buildPlayerBadge } from '@/lib/frontend/badge';
import { fetchLeaderboardPlayerDetail, type LeaderboardPlayerSubmission } from '@/lib/kolk/leaderboard/player-detail';

type PlayerPageProps = {
  params: Promise<{ playerId: string }>;
};

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { playerId } = await params;
  if (!UUID_RE.test(playerId)) return { title: copy.leaderboard.playerDetail.playerNotFoundTitle };
  const detail = await fetchLeaderboardPlayerDetail(playerId);
  if (!detail) return { title: copy.leaderboard.playerDetail.playerNotFoundTitle };
  return { title: detail.userRow.display_name ?? copy.leaderboard.playerDetail.profilePlayerFallback };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatScore(value: number | null) {
  if (value == null) return copy.leaderboard.table.noSubmissionFallback;
  if (!Number.isFinite(value)) return copy.leaderboard.table.noSubmissionFallback;
  return formatNumber(value, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatDate(value: string | null) {
  if (!value) return copy.leaderboard.playerDetail.lastSubmissionFallback;
  return formatDateTime(value, value);
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

function normalizeFlags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0);
}

export default async function PlayerDetailPage({ params }: PlayerPageProps) {
  const { playerId } = await params;
  if (!UUID_RE.test(playerId)) {
    notFound();
  }

  const detail = await fetchLeaderboardPlayerDetail(playerId);

  if (!detail) {
    notFound();
  }

  const { leaderboardRow, userRow, submissions } = detail;

  const bestScores =
    leaderboardRow.best_scores && typeof leaderboardRow.best_scores === 'object' && !Array.isArray(leaderboardRow.best_scores)
      ? (leaderboardRow.best_scores as Record<string, unknown>)
      : {};
  const levelCards = Object.entries(bestScores)
    .map(([level, score]) => ({ level: Number(level), score: Number(score) }))
    .filter((entry) => Number.isFinite(entry.level) && entry.level > 0 && Number.isFinite(entry.score))
    .sort((a, b) => b.level - a.level);

  const recentSubmissions = (Array.isArray(submissions) ? submissions : []) as LeaderboardPlayerSubmission[];
  const pd = copy.leaderboard.playerDetail;
  const badgeCopy = copy.leaderboard.badge;
  const tier = String(leaderboardRow.tier ?? pd.tierFallback);
  const highestLevel = Number(leaderboardRow.highest_level ?? 0);
  const totalScore = Number(leaderboardRow.total_score ?? 0);
  const levelsCompleted = Number(leaderboardRow.levels_completed ?? 0);
  const lastSubmissionAt =
    typeof leaderboardRow.last_submission_at === 'string' ? leaderboardRow.last_submission_at : null;

  // README badge: prefer userRow.max_level (canonical source on ka_users)
  // and fall back to leaderboardRow.highest_level. If the player has no
  // submissions yet (max_level null AND no recent submissions), `buildPlayerBadge`
  // will return null below thanks to `-1`, and we render nothing.
  const badgeHighestLevel =
    typeof userRow.max_level === 'number' && Number.isFinite(userRow.max_level)
      ? userRow.max_level
      : recentSubmissions.length > 0
      ? highestLevel
      : -1;
  const badge = buildPlayerBadge({
    playerId,
    highestLevel: badgeHighestLevel,
    pioneer: userRow.pioneer === true,
    displayName: userRow.display_name,
  });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              {pd.eyebrow}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {userRow.display_name ?? pd.profilePlayerFallback}
            </h1>
            <p className="text-sm text-slate-500">
              {pd.pageHeroSubtitle}
            </p>
          </div>

          <Link
            href="/leaderboard"
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {pd.backToLeaderboard}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.eyebrow}</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">{userRow.display_name ?? pd.profilePlayerFallback}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {userRow.handle ? `@${userRow.handle}` : pd.noPublicHandle}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${tierClasses(tier)}`}>
                    {tier}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 px-4 py-4 sm:px-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.highestLevel}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">L{highestLevel}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.totalScore}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{formatScore(totalScore)}</p>
                  </div>
                </div>

                <dl className="space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">{pd.schoolLabel}</dt>
                    <dd className="max-w-[55%] break-words text-right font-medium text-slate-900">{userRow.school ?? pd.schoolFallback}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">{pd.frameworkLabel}</dt>
                    <dd className="max-w-[55%] break-words text-right font-medium text-slate-900">{userRow.framework ?? pd.frameworkFallback}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">{pd.countryLabel}</dt>
                    <dd className="max-w-[55%] break-words text-right font-medium text-slate-900">{userRow.country ?? pd.countryFallback}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">{pd.levelsCompleted}</dt>
                    <dd className="font-medium text-slate-900">{levelsCompleted}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">{pd.lastSubmissionLabel}</dt>
                    <dd className="text-right font-medium text-slate-900">{formatDate(lastSubmissionAt)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.bestScoresHeading}</p>
              </div>
              <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
                {levelCards.length > 0 ? (
                  levelCards.map((entry) => (
                    <span
                      key={entry.level}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
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
          </aside>

          <section className="space-y-4">
            {badge ? (
              <section
                aria-label={badgeCopy.sectionTitle}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-8"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {badgeCopy.sectionEyebrow}
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
                  {badgeCopy.sectionTitle}
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {badgeCopy.sectionBody}
                </p>

                <div className="mt-4">
                  {/* Render shields.io's external SVG directly — next/image
                      would force a remotePatterns config for img.shields.io
                      and a tiny badge gains nothing from the optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={badge.shieldsUrl} alt={badge.displayLabel} className="h-6" />
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {badgeCopy.markdownLabel}
                  </p>
                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-200 font-mono leading-6">
                    {badge.markdown}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton
                      value={badge.markdown}
                      idleLabel={badgeCopy.copyMarkdown}
                      copiedLabel={badgeCopy.copiedMarkdown}
                      failedLabel={badgeCopy.copyFailed}
                      className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    />
                    <CopyButton
                      value={badge.html}
                      idleLabel={badgeCopy.copyHtml}
                      copiedLabel={badgeCopy.copiedHtml}
                      failedLabel={badgeCopy.copyFailed}
                      className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    />
                  </div>
                </div>
              </section>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
                <h2 className="text-base font-semibold text-slate-950">{pd.recentSubmissionsHeading}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {pd.recentSubmissionsSubtitleAlt}
                </p>
              </div>

              <div className="divide-y divide-slate-200">
                {recentSubmissions.length > 0 ? (
                  recentSubmissions.map((submission) => (
                    <article key={submission.id} className="px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
                              {pd.levelLabel(submission.level)}
                            </span>
                            <span className="text-sm font-semibold text-slate-950">
                              {formatScore(submission.total_score)}
                            </span>
                            <span className="text-sm text-slate-400">{pd.totalSuffix}</span>
                          </div>
                          <p className="max-w-3xl break-words text-sm leading-6 text-slate-600">
                            {submission.judge_summary ?? pd.noSummary}
                          </p>
                        </div>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                          {formatDate(typeof submission.submitted_at === 'string' ? submission.submitted_at : null)}
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.structureLabel}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">{formatScore(submission.structure_score)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.coverageLabel}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">{formatScore(submission.coverage_score)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{pd.qualityLabel}</p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">{formatScore(submission.quality_score)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
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
                  <div className="px-5 py-10 text-sm text-slate-500">
                    {pd.noPublicHistory}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
