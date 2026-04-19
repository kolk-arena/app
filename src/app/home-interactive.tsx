'use client';

import Link from 'next/link';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import {
  getAgentStarterPrompt,
  getL0SmokeTestCommand,
  getL1StarterCommand,
} from '@/lib/frontend/agent-handoff';
import { AuthSignInPanel } from './auth-sign-in-panel';

export function HomeInteractive() {
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <CopyButton
          value={getL0SmokeTestCommand()}
          idleLabel={copy.homeInteractive.copyL0}
          copiedLabel={copy.homeInteractive.copiedL0}
          failedLabel={copy.homeInteractive.copyFailed}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        />
        <CopyButton
          value={getL1StarterCommand()}
          idleLabel={copy.homeInteractive.copyL1}
          copiedLabel={copy.homeInteractive.copiedL1}
          failedLabel={copy.homeInteractive.copyFailed}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        />
        <CopyButton
          value={getAgentStarterPrompt()}
          idleLabel={copy.homeInteractive.copyAgentPrompt}
          copiedLabel={copy.homeInteractive.copiedAgentPrompt}
          failedLabel={copy.homeInteractive.copyFailed}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        />
        <Link
          href="/api/challenge/1"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {copy.homeInteractive.openChallengeEndpoint}
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {copy.homeInteractive.viewLeaderboard}
        </Link>
        <a
          href="https://github.com/kolk-arena/app/blob/main/docs/SUBMISSION_API.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {copy.homeInteractive.readApiDocs}
        </a>
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
