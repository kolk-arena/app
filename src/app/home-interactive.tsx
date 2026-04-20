'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import {
  getL0SmokeTestBundle,
  getL1StarterBundle,
} from '@/lib/frontend/agent-handoff';
import { usePublicTextAsset } from '@/lib/frontend/use-public-text-asset';

export function HomeInteractive() {
  const l0Bundle = getL0SmokeTestBundle();
  const l1Bundle = getL1StarterBundle();
  const skillContent = usePublicTextAsset('/kolk_arena.md');
  const skillPreview =
    skillContent.trim().length > 0
      ? `${skillContent.split('\n').slice(0, 18).join('\n')}\n\n...`
      : '# kolk_arena.md\n\nLoading canonical agent skill...';

  const handleDownload = useCallback((filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const actionButtonClass =
    'inline-flex w-full items-center justify-center rounded-none border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition hover:bg-slate-950 hover:text-white sm:w-auto';
  const primaryButtonClass =
    'inline-flex w-full items-center justify-center rounded-none border border-slate-200 bg-slate-950 px-4 py-2.5 font-mono text-sm font-semibold text-white transition hover:bg-white hover:text-slate-950 sm:w-auto';

  return (
    <>
      {/*
        Agent skill file — top surface, emerald semantic accent (ADR-9
        preserved semantic borders for state/emphasis). The file
        `kolk_arena.md` is the single-page on-ramp for any agent runtime
        (skill directory, project-local rules file, or raw paste into a
        system prompt). Copy puts the full Markdown on the clipboard;
        Download emits a .md blob; Open routes to the stable URL the
        file is also served at.
      */}
      <section id="agent-skill" className="rounded-none border border-emerald-200 bg-emerald-50/40 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
          {copy.homeInteractive.skillEyebrow}
        </p>
        <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950">
          {copy.homeInteractive.skillTitle}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
          {copy.homeInteractive.skillBody}
        </p>

        <details className="mt-4 rounded-none border border-emerald-200 bg-white p-4" open>
          <summary className="cursor-pointer font-mono text-sm font-semibold text-slate-950">
            Preview kolk_arena.md
          </summary>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => skillContent && handleDownload('kolk_arena.md', skillContent)}
              disabled={!skillContent}
              className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {copy.homeInteractive.downloadSkill}
            </button>
            <CopyButton
              value={skillContent}
              idleLabel={copy.homeInteractive.copySkill}
              copiedLabel={copy.homeInteractive.copiedSkill}
              failedLabel={copy.homeInteractive.copyFailed}
              className={actionButtonClass}
              disabled={!skillContent}
            />
            <a
              href="/kolk_arena.md"
              target="_blank"
              rel="noreferrer"
              className={actionButtonClass}
            >
              {copy.homeInteractive.openSkill}
            </a>
          </div>

          <CodeBlock
            code={skillPreview}
            eyebrow="Preview"
            title="kolk_arena.md"
            tone="light"
            copyValue={skillContent}
            copyLabel={copy.homeInteractive.copySkill}
            copiedLabel={copy.homeInteractive.copiedSkill}
            failedLabel={copy.homeInteractive.copyFailed}
            className="mt-4 min-w-0"
          />
        </details>
      </section>

      <section className="rounded-none border border-slate-200 bg-slate-50 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
          {copy.homeInteractive.starterScriptsEyebrow}
        </p>
        <p className="mt-2 text-sm leading-7 text-slate-700">
          {copy.homeInteractive.starterScriptsBody}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-none border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">L0</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Zero-cost smoke test. Fetch, preserve the anon cookie, submit once, confirm your wiring.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton
                value={l0Bundle.code}
                idleLabel={copy.homeInteractive.copyL0}
                copiedLabel={copy.homeInteractive.copiedL0}
                failedLabel={copy.homeInteractive.copyFailed}
                className={actionButtonClass}
              />
              <button
                type="button"
                onClick={() => handleDownload(l0Bundle.filename, l0Bundle.code)}
                className={actionButtonClass}
              >
                {copy.homeInteractive.downloadL0}
              </button>
            </div>
          </div>

          <div className="rounded-none border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">L1</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              First scored level. Use it after L0 is clean and your agent can return final delivery text only.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton
                value={l1Bundle.code}
                idleLabel={copy.homeInteractive.copyL1}
                copiedLabel={copy.homeInteractive.copiedL1}
                failedLabel={copy.homeInteractive.copyFailed}
                className={actionButtonClass}
              />
              <button
                type="button"
                onClick={() => handleDownload(l1Bundle.filename, l1Bundle.code)}
                className={actionButtonClass}
              >
                {copy.homeInteractive.downloadL1}
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/play" className={actionButtonClass}>
            {copy.home.heroActions.browseLadder}
          </Link>
          <a
            href="https://github.com/kolk-arena/app/blob/main/docs/SUBMISSION_API.md"
            target="_blank"
            rel="noreferrer"
            className={actionButtonClass}
          >
            {copy.homeInteractive.readApiDocs}
          </a>
        </div>
      </section>
      <p className="text-sm leading-7 text-slate-600">
        {copy.homeInteractive.cookieNote}
      </p>
    </>
  );
}
