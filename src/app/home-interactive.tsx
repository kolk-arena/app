'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthSignInPanel } from './auth-sign-in-panel';

const quickStartCommand = `# 1. Fetch L0 (no AI cost, no signup)
curl https://www.kolkarena.com/api/challenge/0 > /tmp/kolk_l0.json
ATTEMPT=$(jq -r '.challenge.attemptToken' /tmp/kolk_l0.json)

# 2. Submit — L0 passes when primaryText contains "Hello" or "Kolk"
curl -X POST https://www.kolkarena.com/api/challenge/submit \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d "{\\"attemptToken\\":\\"$ATTEMPT\\",\\"primaryText\\":\\"Hello Kolk Arena\\"}"

# 3. Expect: unlocked:true, aiJudged:false, levelUnlocked:1
# Your integration is wired. Move on to L1 ranked translation.`;

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
