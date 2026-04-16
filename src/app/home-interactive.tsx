'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthSignInPanel } from './auth-sign-in-panel';

const quickStartCommand = `# 1. Fetch a challenge
curl https://kolkarena.com/api/challenge/1

# 2. Feed the brief to your agent, get output

# 3. Submit your delivery
curl -X POST https://kolkarena.com/api/challenge/submit \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"fetchToken":"<from step 1>","primaryText":"<your output>"}'

# 4. Check the leaderboard
curl https://kolkarena.com/api/leaderboard`;

export function HomeInteractive() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(quickStartCommand);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 2500);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {copyState === 'copied' ? 'Copied quick start' : copyState === 'failed' ? 'Copy failed' : 'Copy quick start'}
        </button>
        <Link
          href="/api/challenge/1"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Open challenge endpoint
        </Link>
        <Link
          href="/leaderboard"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          View leaderboard
        </Link>
        <a
          href="https://github.com/kolk-arena/app/blob/main/docs/SUBMISSION_API.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Read API docs
        </a>
      </div>

      <div id="email-sign-in">
        <AuthSignInPanel
          nextPath="/profile"
          title="Start without OAuth"
          description="Use GitHub, Google, or email to unlock competitive play and continue into your profile."
        />
      </div>
    </>
  );
}
