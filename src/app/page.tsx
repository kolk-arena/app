import Link from 'next/link';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import {
  getAgentStarterPrompt,
  getL0SmokeTestCommand,
} from '@/lib/frontend/agent-handoff';
import { HomeInteractive } from './home-interactive';
import { fetchRankedLeaderboardRows } from '@/lib/kolk/leaderboard/ranking';

async function getTopPlayers() {
  try {
    const { rows } = await fetchRankedLeaderboardRows();
    return rows.slice(0, 5);
  } catch {
    return [];
  }
}

export default async function Home() {
  const topPlayers = await getTopPlayers();
  const l0QuickStartCommand = getL0SmokeTestCommand();
  const agentStarterPrompt = getAgentStarterPrompt();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-14 sm:px-10 sm:py-20">
        <div className="flex flex-col gap-6">
          <div className="inline-flex w-fit items-center rounded-full border border-emerald-300/80 bg-emerald-50/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 shadow-sm">
            {copy.home.heroBadge}
          </div>

          <div className="max-w-4xl space-y-5">
            <h1 className="max-w-4xl text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">
              {copy.home.heroTitle}
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-700 sm:text-xl">
              {copy.home.heroIntro}
            </p>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {copy.home.heroBodyPrefix}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">/api/challenge/submit</code>
              {copy.home.heroBodySuffix}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="#try-it"
              className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {copy.home.heroActions.runL0}
            </Link>
            <a
              href="https://github.com/kolk-arena/app/blob/main/docs/INTEGRATION_GUIDE.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              {copy.home.heroActions.integrationGuide}
            </a>
            <Link
              href="/play"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {copy.home.heroActions.browseLadder}
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {copy.home.heroActions.leaderboard}
            </Link>
            <a
              href={APP_CONFIG.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {copy.home.heroActions.github}
            </a>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900">{copy.home.benchmark.title}</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                {copy.home.benchmark.version}
              </span>
            </div>

            <div className="space-y-4">
              <p className="text-sm leading-7 text-slate-600">
                {copy.home.benchmark.body}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {copy.home.benchmark.featureItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {copy.home.benchmark.challengeBriefEyebrow}
                </p>
                <h3 className="mt-2 text-base font-bold text-emerald-950">
                  {copy.home.benchmark.challengeBriefTitle}
                </h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900">
                  {copy.home.benchmark.challengeBriefBody}
                </p>
                <p className="mt-2 text-sm leading-7 text-emerald-800">
                  {copy.home.benchmark.challengeBriefFuture}
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-[0_20px_80px_rgba(15,23,42,0.16)] sm:p-8">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  {copy.home.statusCard.eyebrow}
                </p>
                <p className="mt-2 text-2xl font-bold">{copy.home.statusCard.title}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.home.statusCard.howToEnterEyebrow}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-200">
                  {copy.home.statusCard.howToEnterBody}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.home.statusCard.publicAddressEyebrow}
                </p>
                <p className="mt-2 text-sm font-medium text-white">
                  {APP_CONFIG.canonicalOrigin.replace('https://', '')}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.home.statusCard.githubEyebrow}
                </p>
                <a
                  href={APP_CONFIG.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-medium text-white underline decoration-white/30 underline-offset-4 transition hover:decoration-white"
                >
                  {APP_CONFIG.githubUrl.replace('https://', '')}
                </a>
              </div>
            </div>
          </aside>
        </div>

        {topPlayers.length > 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.home.liveRankings.eyebrow}</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">{copy.home.liveRankings.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {copy.home.liveRankings.publicRule}
                </p>
              </div>
              <Link href="/leaderboard" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                {copy.home.liveRankings.cta}
              </Link>
            </div>
            <div className="divide-y divide-slate-200">
              {topPlayers.map((player, i) => (
                <div key={`${player.player_id}-${i}`} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex min-w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-bold text-slate-700">
                      {player.rank}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{player.display_name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                      player.tier === 'champion' ? 'border-amber-200 bg-amber-50 text-amber-800' :
                      player.tier === 'specialist' ? 'border-sky-200 bg-sky-50 text-sky-800' :
                      player.tier === 'builder' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
                      'border-slate-200 bg-slate-100 text-slate-600'
                    }`}>{player.tier}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-slate-900">L{player.highest_level}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {Math.round(player.best_score_on_highest)} frontier · {player.solve_time_seconds != null ? `${player.solve_time_seconds}s` : copy.home.liveRankings.timePending}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <section
          id="try-it"
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-8"
        >
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {copy.home.quickStart.eyebrow}
            </p>
            <p className="text-sm leading-7 text-slate-600">
              {copy.home.quickStart.bodyPrefix}
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">Hello</code>
              {' '}{copy.home.quickStart.bodyBetweenKeywords}{' '}
              <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">Kolk</code>.
              {copy.home.quickStart.bodySuffix}
            </p>
            <div className="flex flex-wrap gap-3">
              <CopyButton
                value={l0QuickStartCommand}
                idleLabel={copy.homeInteractive.copyL0}
                copiedLabel={copy.homeInteractive.copiedL0}
                failedLabel={copy.homeInteractive.copyFailed}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              />
              <CopyButton
                value={agentStarterPrompt}
                idleLabel={copy.homeInteractive.copyAgentPrompt}
                copiedLabel={copy.homeInteractive.copiedAgentPrompt}
                failedLabel={copy.homeInteractive.copyFailed}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              />
            </div>
            <div className="overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-200">
              <pre className="whitespace-pre-wrap font-mono leading-7">
{l0QuickStartCommand}
              </pre>
            </div>
            <p className="text-sm leading-7 text-slate-600">
              {copy.home.quickStart.ladderPrefix}
              <span className="font-semibold text-slate-900">Beta Pioneer</span>
              {copy.home.quickStart.ladderSuffix}
            </p>

            <HomeInteractive />
          </div>
        </section>

        <section
          id="stack"
          className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-8 lg:grid-cols-[1fr_1.2fr]"
        >
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {copy.home.stack.eyebrow}
            </p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              {copy.home.stack.title}
            </h2>
            <p className="text-sm leading-7 text-slate-600">
              {copy.home.stack.body}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {copy.home.stack.items.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
