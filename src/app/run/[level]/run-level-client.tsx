'use client';

import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { QuickActionButton, getQuickActionButtonClassName } from '@/components/ui/quick-action-button';
import { copy } from '@/i18n';

type RunLevelClientProps = {
  level: number;
  command: string;
  challengePath: string;
  challengeUrl: string;
  apiUrl: string;
  leaderboardPath: string;
};

function HandoffRow({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="grid gap-2 border-t border-slate-200 py-4 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center">
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="min-w-0">
        <input className="form-control font-mono text-sm" value={value} readOnly aria-label={label} />
      </dd>
      <dd>
        <CopyButton
          value={value}
          idleLabel={copyLabel}
          copiedLabel={copy.common.copied}
          failedLabel={copy.common.copyFailed}
          className="action-button action-button-secondary action-button-md w-full focus-visible:outline-none sm:w-auto"
        />
      </dd>
    </div>
  );
}

export function RunLevelClient({
  level,
  command,
  challengePath,
  challengeUrl,
  apiUrl,
  leaderboardPath,
}: RunLevelClientProps) {
  const runCopy = copy.run;
  const secondaryButtonClass = getQuickActionButtonClassName({
    variant: 'secondary',
    tone: 'sans',
    size: 'md',
    width: 'stack',
  });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="max-w-4xl space-y-3">
          <p className="inline-flex w-fit items-center rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-sm">
            {runCopy.eyebrow}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            {runCopy.title(level)}
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-700 sm:text-base">
            {runCopy.body(level)}
          </p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {runCopy.commandEyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">{runCopy.commandTitle}</h2>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <CodeBlock
              code={command}
              language="bash"
              tone="dark"
              wrap={false}
              copyValue={command}
              copyLabel={runCopy.copyCommand}
              copiedLabel={runCopy.copiedCommand}
              failedLabel={copy.common.copyFailed}
              className="rounded-md"
            />
            <p className="mt-3 text-xs leading-6 text-slate-600">
              {runCopy.commandNote}
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {runCopy.browserAgentEyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">{runCopy.browserAgentTitle}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-700">
              {runCopy.browserAgentBody}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <QuickActionButton href={challengePath} variant="accent" size="md">
                {runCopy.openChallenge}
              </QuickActionButton>
              <CopyButton
                value={challengeUrl}
                idleLabel={runCopy.copyChallengeUrl}
                copiedLabel={runCopy.copiedChallengeUrl}
                failedLabel={copy.common.copyFailed}
                className={secondaryButtonClass}
              />
              <QuickActionButton href={leaderboardPath} variant="secondary" size="md">
                {runCopy.viewLeaderboard}
              </QuickActionButton>
            </div>
          </div>

          <aside className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700 shadow-sm sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {runCopy.guardrailEyebrow}
            </p>
            <p className="mt-2">{runCopy.guardrailBody}</p>
          </aside>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-950">{runCopy.linksTitle}</h2>
          <dl className="mt-2">
            <HandoffRow
              label={runCopy.challengeUrlLabel}
              value={challengeUrl}
              copyLabel={runCopy.copyChallengeUrl}
            />
            <HandoffRow
              label={runCopy.apiUrlLabel}
              value={apiUrl}
              copyLabel={runCopy.copyApiUrl}
            />
          </dl>
        </section>
      </section>
    </main>
  );
}
