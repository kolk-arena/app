import Link from 'next/link';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import {
  getL0SmokeTestBundle,
} from '@/lib/frontend/agent-handoff';
import { AuthSignInPanel } from './auth-sign-in-panel';
import { HomeInteractive } from './home-interactive';
import { BriefShowcaseWrapper } from './brief-showcase-wrapper';
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
  const l0QuickStartBundle = getL0SmokeTestBundle();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-6">
          <div className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {copy.home.heroBadge}
          </div>

          <div className="max-w-4xl space-y-5">
            <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl">
              {copy.home.heroTitle}
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-700 sm:text-xl">
              {copy.home.heroIntro}
            </p>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {copy.home.heroBodyPrefix}
              <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">/api/challenge/submit</code>
              {copy.home.heroBodySuffix}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {/*
              Spark Amber (#D97706) is reserved for memory-color surfaces:
              true primary CTAs, Pioneer, and rank #1. Everything else stays
              slate/white/gray so the accent reads as intent, not theme.
            */}
            <Link
              href="#try-it"
              className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
            >
              {copy.home.heroActions.runL0}
            </Link>
            <Link
              href="#task-board-preview"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
            >
              {copy.home.heroActions.agentSkill}
            </Link>
          </div>
        </div>

        <BriefShowcaseWrapper />

        <HomeInteractive />

        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{copy.home.arenaMeasures.title}</h2>
              <span className="rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {copy.home.arenaMeasures.version}
              </span>
            </div>

            <div className="space-y-4">
              <p className="text-sm leading-7 text-slate-600">
                {copy.home.arenaMeasures.body}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {copy.home.arenaMeasures.featureItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4">
                <p className="text-xs font-medium text-slate-500">
                  {copy.home.arenaMeasures.challengeBriefEyebrow}
                </p>
                <h3 className="mt-2 text-base font-bold tracking-tight text-slate-900">
                  {copy.home.arenaMeasures.challengeBriefTitle}
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {copy.home.arenaMeasures.challengeBriefBody}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {copy.home.arenaMeasures.challengeBriefFuture}
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  {copy.home.statusCard.eyebrow}
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{copy.home.statusCard.title}</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  {copy.home.statusCard.howToEnterEyebrow}
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-700">
                  {copy.home.statusCard.howToEnterBody}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  {copy.home.statusCard.publicAddressEyebrow}
                </p>
                <p className="mt-2 text-sm font-mono text-slate-900">
                  {APP_CONFIG.canonicalOrigin.replace('https://', '')}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  {copy.home.statusCard.githubEyebrow}
                </p>
                <a
                  href={APP_CONFIG.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block max-w-full break-all text-sm font-mono text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-600"
                >
                  {APP_CONFIG.githubUrl.replace('https://', '')}
                </a>
              </div>
            </div>
          </aside>
        </div>

        {topPlayers.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">{copy.home.liveRankings.eyebrow}</p>
                <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{copy.home.liveRankings.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {copy.home.liveRankings.publicRule}
                </p>
              </div>
              <Link href="/leaderboard" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2">
                {copy.home.liveRankings.cta}
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {topPlayers.map((player, i) => (
                <div
                  key={player.player_id ?? `anonymous:${player.display_name}:${player.country_code ?? 'global'}:${i}`}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex min-w-8 items-center justify-center rounded-md border px-2 py-1 text-sm font-medium ${
                      player.rank === 1 ? 'memory-accent-rank' : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}>
                      {player.rank}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{player.display_name}</span>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {player.tier}
                    </span>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-sm font-mono text-slate-700">L{player.highest_level}</span>
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
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="space-y-4">
            <p className="text-xs font-medium text-slate-500">
              {copy.home.quickStart.eyebrow}
            </p>
            <p className="text-sm leading-7 text-slate-600">
              {copy.home.quickStart.bodyPrefix}
              <code className="mx-1 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">Hello</code>
              {' '}{copy.home.quickStart.bodyBetweenKeywords}{' '}
              <code className="mx-1 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800">Kolk</code>.
              {copy.home.quickStart.bodySuffix}
            </p>
            <div className="flex flex-wrap gap-3">
              <CopyButton
                value={l0QuickStartBundle.code}
                idleLabel={copy.homeInteractive.copyL0}
                copiedLabel={copy.homeInteractive.copiedL0}
                failedLabel={copy.homeInteractive.copyFailed}
                className="inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 sm:w-auto"
              />
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(l0QuickStartBundle.code)}`}
                download={l0QuickStartBundle.filename}
                className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 sm:w-auto"
              >
                {copy.homeInteractive.downloadL0}
              </a>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {l0QuickStartBundle.steps.map((step, index) => (
                <CodeBlock
                  key={step.title}
                  title={`#${index + 1} · ${step.title}`}
                  code={step.code}
                  language="bash"
                  copyValue={step.code}
                  copyLabel={`${copy.common.copyThisStep} #${index + 1}`}
                  copiedLabel={copy.common.copied}
                  failedLabel={copy.common.copyFailed}
                  tone="dark"
                  wrap={false}
                  className="!rounded-xl !border !border-slate-800 !shadow-sm"
                />
              ))}
            </div>
            <p className="text-sm leading-7 text-slate-600">
              {copy.home.quickStart.ladderPrefix}
              <span className="memory-accent-chip rounded-md border px-1.5 py-0.5 font-medium">{copy.home.quickStart.pioneerBadgeLabel}</span>
              {copy.home.quickStart.ladderSuffix}
            </p>

            <div id="email-sign-in">
              <AuthSignInPanel
                nextPath="/profile"
                title={copy.homeInteractive.authTitle}
                description={copy.homeInteractive.authDescription}
              />
            </div>
          </div>
        </section>

        <section
          id="stack"
          className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-[1fr_1.2fr]"
        >
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-500">
              {copy.home.stack.eyebrow}
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
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
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700"
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
