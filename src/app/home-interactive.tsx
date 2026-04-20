'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import {
  getAgentStarterPrompt,
  getL0SmokeTestBundle,
  getL1StarterBundle,
} from '@/lib/frontend/agent-handoff';
import { AuthSignInPanel } from './auth-sign-in-panel';

export function HomeInteractive() {
  const l0Bundle = getL0SmokeTestBundle();
  const l1Bundle = getL1StarterBundle();

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
    'inline-flex w-full items-center justify-center rounded-none border-2 border-slate-950 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition hover:bg-slate-950 hover:text-white sm:w-auto';
  const primaryButtonClass =
    'inline-flex w-full items-center justify-center rounded-none border-2 border-slate-950 bg-slate-950 px-4 py-2.5 font-mono text-sm font-semibold text-white transition hover:bg-white hover:text-slate-950 sm:w-auto';

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="min-w-0 rounded-none border-2 border-slate-950 bg-slate-50 p-5 sm:p-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
            {copy.homeInteractive.starterScriptsEyebrow}
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            {copy.homeInteractive.starterScriptsBody}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-none border-2 border-slate-950 bg-white p-4">
              <div className="flex flex-col gap-2">
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
            <div className="rounded-none border-2 border-slate-950 bg-white p-4">
              <div className="flex flex-col gap-2">
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
        </section>

        <div className="grid min-w-0 gap-4">
          <section className="rounded-none border-2 border-slate-950 bg-white p-5 sm:p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              {copy.homeInteractive.handoffEyebrow}
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-700">
              {copy.homeInteractive.handoffBody}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <CopyButton
                value={getAgentStarterPrompt()}
                idleLabel={copy.homeInteractive.copyAgentPrompt}
                copiedLabel={copy.homeInteractive.copiedAgentPrompt}
                failedLabel={copy.homeInteractive.copyFailed}
                className={primaryButtonClass}
              />
            </div>
          </section>

          <section className="rounded-none border-2 border-slate-950 bg-white p-5 sm:p-6">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
              {copy.homeInteractive.resourcesEyebrow}
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-700">
              {copy.homeInteractive.resourcesBody}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/api/challenge/1" className={actionButtonClass}>
                {copy.homeInteractive.openChallengeEndpoint}
              </Link>
              <Link href="/leaderboard" className={actionButtonClass}>
                {copy.homeInteractive.viewLeaderboard}
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
        </div>
      </div>

      <p className="text-sm leading-7 text-slate-600">
        {copy.homeInteractive.cookieNote}
      </p>

      <div id="email-sign-in">
        <AuthSignInPanel
          nextPath="/profile"
          title={copy.homeInteractive.authTitle}
          description={copy.homeInteractive.authDescription}
        />
      </div>
    </>
  );
}
