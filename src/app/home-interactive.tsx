'use client';

import { useCallback } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { QuickActionButton, getQuickActionButtonClassName } from '@/components/ui/quick-action-button';
import { copy } from '@/i18n';
import { usePublicTextAsset } from '@/lib/frontend/use-public-text-asset';

export function HomeInteractive() {
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

  const actionButtonClass = getQuickActionButtonClassName({
    variant: 'secondary',
    tone: 'sans',
    size: 'md',
    width: 'stack',
    className: 'rounded-md',
  });
  return (
    <>
      <section id="agent-skill" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
          {copy.homeInteractive.skillEyebrow}
        </p>
        <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950">
          {copy.homeInteractive.skillTitle}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
          {copy.homeInteractive.skillBody}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <QuickActionButton
            type="button"
            onClick={() => skillContent && handleDownload('kolk_arena.md', skillContent)}
            disabled={!skillContent}
            className="memory-accent-button rounded-md"
          >
            {copy.homeInteractive.downloadSkill}
          </QuickActionButton>
          <CopyButton
            value={skillContent}
            idleLabel={copy.homeInteractive.copySkill}
            copiedLabel={copy.homeInteractive.copiedSkill}
            failedLabel={copy.homeInteractive.copyFailed}
            className={actionButtonClass}
            disabled={!skillContent}
          />
          <QuickActionButton
            href="/kolk_arena.md"
            target="_blank"
            rel="noreferrer"
            className={actionButtonClass}
            ariaLabel={copy.homeInteractive.openSkill}
          >
            {copy.homeInteractive.openSkill}
          </QuickActionButton>
        </div>

        <CodeBlock
          code={skillPreview}
          language="markdown"
          title="kolk_arena.md"
          tone="light"
          copyValue={skillContent}
          copyLabel={copy.homeInteractive.copySkill}
          copiedLabel={copy.homeInteractive.copiedSkill}
          failedLabel={copy.homeInteractive.copyFailed}
          className="mt-4 min-w-0"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
          {copy.homeInteractive.starterScriptsEyebrow}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
          {copy.homeInteractive.starterScriptsBody}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">{copy.homeInteractive.nextRunTitle}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {copy.homeInteractive.nextRunBody}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <QuickActionButton href="#try-it" className="memory-accent-button rounded-md">
                {copy.home.heroActions.runL0}
              </QuickActionButton>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">{copy.homeInteractive.ladderTitle}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {copy.homeInteractive.ladderBody}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <QuickActionButton href="/play" className={actionButtonClass}>
                {copy.home.heroActions.browseLadder}
              </QuickActionButton>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          {copy.homeInteractive.cookieNote}{' '}
          <a
            href="https://github.com/kolk-arena/app/blob/main/docs/SUBMISSION_API.md"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950 hover:decoration-slate-600"
          >
            {copy.homeInteractive.readApiDocs}
          </a>
        </p>
      </section>
    </>
  );
}
