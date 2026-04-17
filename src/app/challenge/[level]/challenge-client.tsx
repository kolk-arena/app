'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

type ChallengePackage = {
  challengeId: string;
  level: number;
  seed?: number;
  variant?: string;
  fetchToken: string;
  taskJson: Record<string, unknown>;
  promptMd: string;
  suggestedTimeMinutes?: number;
  timeLimitMinutes: number;
  deadlineUtc: string;
  challengeStartedAt: string;
};

type LevelInfo = {
  name: string;
  family: string;
  band: string;
  unlock_rule: string;
  suggested_time_minutes: number;
  is_boss: boolean;
  ai_judged: boolean;
  leaderboard_eligible: boolean;
};

type FetchResponse = {
  challenge: ChallengePackage;
  level_info: LevelInfo;
  boss_hint?: string;
  replay_warning?: string;
};

type SubmitResponse = {
  submissionId: string;
  challengeId: string;
  level: number;
  structureScore?: number;
  coverageScore?: number;
  qualityScore?: number;
  totalScore: number;
  fieldScores?: { field: string; score: number; reason: string }[];
  qualitySubscores?: { toneFit: number; clarity: number; usefulness: number; businessFit: number };
  flags: string[];
  summary: string;
  unlocked: boolean;
  colorBand: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';
  qualityLabel: string;
  levelUnlocked?: number;
  percentile?: number | null;
  solveTimeSeconds?: number;
  fetchToSubmitSeconds?: number;
  efficiencyBadge?: boolean;
  aiJudged?: boolean;
  leaderboardEligible?: boolean;
  showRegisterPrompt?: boolean;
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: FetchResponse }
  | { kind: 'auth_required'; message: string }
  | { kind: 'level_locked'; message: string; highestPassed?: number; nextLevel?: number }
  | { kind: 'feature_not_public'; message: string }
  | { kind: 'no_challenges'; message: string }
  | { kind: 'schema_not_ready'; message: string }
  | { kind: 'error'; message: string; code?: string };

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; result: SubmitResponse }
  | { kind: 'validation_error'; message: string; parserPosition?: string; isL5JsonError?: boolean }
  | { kind: 'auth_required'; message: string }
  | { kind: 'identity_mismatch'; message: string }
  | { kind: 'session_expired'; message: string }
  | { kind: 'session_already_submitted'; message: string }
  | { kind: 'rate_limited'; message: string; retryAfterSeconds?: number }
  | { kind: 'scoring_unavailable'; message: string }
  | { kind: 'error'; message: string; code?: string };

const L5_REQUIRED_KEYS = ['whatsapp_message', 'quick_facts', 'first_step_checklist'] as const;

// ============================================================================
// Helpers
// ============================================================================

function randomIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatSeconds(total: number): string {
  if (!Number.isFinite(total) || total < 0) return '0:00';
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function bandColor(band: SubmitResponse['colorBand']): string {
  switch (band) {
    case 'RED': return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'ORANGE': return 'border-orange-200 bg-orange-50 text-orange-800';
    case 'YELLOW': return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'GREEN': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'BLUE': return 'border-sky-200 bg-sky-50 text-sky-800';
    default: return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function validateL5Json(text: string): { ok: true } | { ok: false; message: string; position?: string } {
  const trimmed = text.trim();
  if (/^```/.test(trimmed)) {
    return {
      ok: false,
      message: 'Remove the Markdown code fences — L5 primaryText must be raw JSON, not wrapped in ``` blocks.',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { ok: false, message: `JSON parse error: ${message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'L5 primaryText must be a JSON object (not an array or primitive).' };
  }
  const obj = parsed as Record<string, unknown>;
  const missing = L5_REQUIRED_KEYS.filter((k) => typeof obj[k] !== 'string');
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Missing or non-string required key(s): ${missing.join(', ')}. All three keys must be strings.`,
    };
  }
  return { ok: true };
}

// ============================================================================
// Main component
// ============================================================================

export function ChallengeClient({ level }: { level: number }) {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'loading' });
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>({ kind: 'idle' });
  const [primaryText, setPrimaryText] = useState(level === 0 ? 'Hello, Kolk Arena!' : '');
  const [now, setNow] = useState<number>(() => Date.now());
  const [registerPromptOpen, setRegisterPromptOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const idempotencyKeyRef = useRef<string>('');

  const requestFreshChallenge = useCallback(() => {
    setSubmitStatus({ kind: 'idle' });
    setRegisterPromptOpen(false);
    setPrimaryText(level === 0 ? 'Hello, Kolk Arena!' : '');
    idempotencyKeyRef.current = randomIdempotencyKey();
    setRefreshNonce((current) => current + 1);
  }, [level]);

  // ── Fetch challenge on mount / refetch ──
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function fetchChallenge() {
      setFetchState({ kind: 'loading' });
      try {
        const resp = await fetch(`/api/challenge/${level}`, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });

        const payload = await resp.json().catch(() => ({}));
        if (!active) return;

        if (resp.ok) {
          setFetchState({ kind: 'ready', data: payload as FetchResponse });
          idempotencyKeyRef.current = randomIdempotencyKey();
          if (level === 0) {
            setPrimaryText((current) => (current.trim().length > 0 ? current : 'Hello, Kolk Arena!'));
          }
          return;
        }

        const code: string | undefined = typeof payload?.code === 'string' ? payload.code : undefined;
        const msg: string = typeof payload?.error === 'string' ? payload.error : `Request failed (${resp.status})`;

        if (resp.status === 401 || code === 'AUTH_REQUIRED') {
          setFetchState({ kind: 'auth_required', message: msg });
        } else if (resp.status === 403 && code === 'LEVEL_LOCKED') {
          setFetchState({
            kind: 'level_locked',
            message: msg,
            highestPassed: typeof payload?.highest_passed === 'number' ? payload.highest_passed : undefined,
            nextLevel: typeof payload?.next_level === 'number' ? payload.next_level : undefined,
          });
        } else if (resp.status === 403 && code === 'FEATURE_NOT_PUBLIC') {
          setFetchState({ kind: 'feature_not_public', message: msg });
        } else if (resp.status === 503 && code === 'NO_CHALLENGES') {
          setFetchState({ kind: 'no_challenges', message: msg });
        } else if (resp.status === 503 && code === 'SCHEMA_NOT_READY') {
          setFetchState({ kind: 'schema_not_ready', message: msg });
        } else {
          setFetchState({ kind: 'error', message: msg, code });
        }
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setFetchState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to fetch challenge',
        });
      }
    }

    void fetchChallenge();

    return () => {
      active = false;
      controller.abort();
    };
  }, [level, refreshNonce]);

  // ── Timer tick (1s) while ready ──
  useEffect(() => {
    if (fetchState.kind !== 'ready') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [fetchState.kind]);

  // ── Submit handler ──
  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (fetchState.kind !== 'ready') return;
      if (primaryText.trim().length === 0) {
        setSubmitStatus({
          kind: 'validation_error',
          message: 'primaryText cannot be empty. Produce a delivery and resubmit.',
        });
        return;
      }

      if (level === 5) {
        const check = validateL5Json(primaryText);
        if (!check.ok) {
          setSubmitStatus({
            kind: 'validation_error',
            message: check.message,
            isL5JsonError: true,
            parserPosition: check.position,
          });
          return;
        }
      }

      setSubmitStatus({ kind: 'submitting' });

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = randomIdempotencyKey();
      }

      try {
        const resp = await fetch('/api/challenge/submit', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKeyRef.current,
          },
          body: JSON.stringify({
            fetchToken: fetchState.data.challenge.fetchToken,
            primaryText,
          }),
        });

        const payload = await resp.json().catch(() => ({}));
        const code: string | undefined = typeof payload?.code === 'string' ? payload.code : undefined;
        const message: string = typeof payload?.error === 'string' ? payload.error : 'Submit failed';

        if (resp.ok) {
          const result = payload as SubmitResponse;
          setSubmitStatus({ kind: 'success', result });
          if (result.showRegisterPrompt === true && level === 5) {
            setRegisterPromptOpen(true);
          }
          return;
        }

        if (resp.status === 422 && code === 'L5_INVALID_JSON') {
          const parserPosition =
            typeof payload?.parser_position === 'string'
              ? payload.parser_position
              : resp.headers.get('x-parser-position') ?? undefined;
          setSubmitStatus({
            kind: 'validation_error',
            message,
            parserPosition,
            isL5JsonError: true,
          });
          // Keep the idempotency key fresh for the retry attempt
          idempotencyKeyRef.current = randomIdempotencyKey();
          return;
        }

        if (resp.status === 400) {
          // VALIDATION_ERROR — does NOT consume the session; rotate idempotency key
          idempotencyKeyRef.current = randomIdempotencyKey();
          setSubmitStatus({ kind: 'validation_error', message });
          return;
        }

        if (resp.status === 401 || code === 'AUTH_REQUIRED') {
          setSubmitStatus({ kind: 'auth_required', message });
          return;
        }

        if (resp.status === 403 && code === 'IDENTITY_MISMATCH') {
          setSubmitStatus({ kind: 'identity_mismatch', message });
          return;
        }

        if (resp.status === 408 || code === 'SESSION_EXPIRED') {
          setSubmitStatus({ kind: 'session_expired', message });
          return;
        }

        if (resp.status === 409 && code === 'SESSION_ALREADY_SUBMITTED') {
          setSubmitStatus({ kind: 'session_already_submitted', message });
          return;
        }

        if (resp.status === 409 && code === 'DUPLICATE_REQUEST') {
          idempotencyKeyRef.current = randomIdempotencyKey();
          setSubmitStatus({
            kind: 'error',
            message: 'Duplicate request detected. Regenerate and try again.',
            code,
          });
          return;
        }

        if (resp.status === 429 || code === 'RATE_LIMITED') {
          const retryAfterHeader = resp.headers.get('retry-after');
          const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
          setSubmitStatus({
            kind: 'rate_limited',
            message,
            retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
          });
          return;
        }

        if (resp.status === 503 && (code === 'SCORING_UNAVAILABLE' || code === 'SCHEMA_NOT_READY')) {
          setSubmitStatus({ kind: 'scoring_unavailable', message });
          return;
        }

        setSubmitStatus({ kind: 'error', message, code });
      } catch (err) {
        setSubmitStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Submit failed',
        });
      }
    },
    [fetchState, level, primaryText],
  );

  // ── Derived timer values ──
  const suggestedRemaining = useMemo(() => {
    if (fetchState.kind !== 'ready') return null;
    const started = new Date(fetchState.data.challenge.challengeStartedAt).getTime();
    const suggested = fetchState.data.challenge.suggestedTimeMinutes ?? fetchState.data.level_info.suggested_time_minutes ?? 5;
    const elapsed = Math.max(0, Math.floor((now - started) / 1000));
    const total = Math.max(0, suggested * 60 - elapsed);
    return { remainingSeconds: total, elapsed, isOver: elapsed > suggested * 60 };
  }, [fetchState, now]);

  const deadlineRemaining = useMemo(() => {
    if (fetchState.kind !== 'ready') return null;
    const deadline = new Date(fetchState.data.challenge.deadlineUtc).getTime();
    return Math.max(0, Math.floor((deadline - now) / 1000));
  }, [fetchState, now]);

  const l5LocalValidation = useMemo(() => {
    if (level !== 5) return null;
    if (primaryText.trim().length === 0) return null;
    return validateL5Json(primaryText);
  }, [level, primaryText]);

  // ========================================================================
  // Render
  // ========================================================================

  if (fetchState.kind === 'loading') {
    return <LoadingShell level={level} />;
  }

  if (fetchState.kind === 'auth_required') {
    return (
      <ErrorShell
        title="Sign-in required"
        accent="rose"
        message={fetchState.message}
        primary={{ href: '/profile', label: 'Sign in' }}
        secondary={{ href: '/play', label: 'Back to Play' }}
      />
    );
  }

  if (fetchState.kind === 'level_locked') {
    const nextL = fetchState.nextLevel ?? (fetchState.highestPassed ?? 0) + 1;
    return (
      <ErrorShell
        title={`Level ${level} is locked`}
        accent="amber"
        message={fetchState.message}
        primary={{ href: `/challenge/${nextL}`, label: `Try L${nextL} first` }}
        secondary={{ href: '/play', label: 'Back to Play' }}
      />
    );
  }

  if (fetchState.kind === 'feature_not_public') {
    return (
      <ErrorShell
        title="Not in the public beta"
        accent="slate"
        message={fetchState.message}
        primary={{ href: '/play', label: 'See public beta levels (L0-L8)' }}
      />
    );
  }

  if (fetchState.kind === 'no_challenges') {
    return (
      <ErrorShell
        title="No challenges available right now"
        accent="amber"
        message={fetchState.message}
        primary={{ label: 'Retry', onClick: requestFreshChallenge }}
        secondary={{ href: '/play', label: 'Back to Play' }}
      />
    );
  }

  if (fetchState.kind === 'schema_not_ready') {
    return (
      <ErrorShell
        title="Service temporarily unavailable"
        accent="rose"
        message={fetchState.message}
        primary={{ label: 'Retry', onClick: requestFreshChallenge }}
        secondary={{ href: '/play', label: 'Back to Play' }}
      />
    );
  }

  if (fetchState.kind === 'error') {
    return (
      <ErrorShell
        title="Could not load challenge"
        accent="rose"
        message={fetchState.message}
        primary={{ label: 'Retry', onClick: requestFreshChallenge }}
        secondary={{ href: '/play', label: 'Back to Play' }}
      />
    );
  }

  // fetchState.kind === 'ready'
  const { challenge, level_info, replay_warning, boss_hint } = fetchState.data;

  // Success overlay — render result card instead of the form
  if (submitStatus.kind === 'success') {
    return (
      <ResultCard
        result={submitStatus.result}
        levelName={level_info.name}
        registerPromptOpen={registerPromptOpen}
        onDismissRegisterPrompt={() => setRegisterPromptOpen(false)}
        onRetry={requestFreshChallenge}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/play"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              ← Play
            </Link>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-700">
              L{level} · Band {level_info.band}
            </span>
            {level_info.is_boss ? (
              <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-800">
                Boss level
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{level_info.name}</h1>
          {boss_hint ? (
            <p className="text-sm leading-6 text-rose-700">{boss_hint}</p>
          ) : null}
          {replay_warning ? (
            <p className="text-sm leading-6 text-amber-700">{replay_warning}</p>
          ) : null}
        </header>

        {/* Timer card */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${suggestedRemaining && suggestedRemaining.isOver ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Suggested time</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">
              {suggestedRemaining ? formatSeconds(suggestedRemaining.remainingSeconds) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {suggestedRemaining?.isOver
                ? 'Past suggested time — still accepted, no score change.'
                : `~${challenge.suggestedTimeMinutes ?? level_info.suggested_time_minutes} min for the Efficiency Badge`}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Session deadline (24h hard ceiling)</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">
              {deadlineRemaining != null ? formatSeconds(deadlineRemaining) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {challenge.deadlineUtc ? `Expires ${new Date(challenge.deadlineUtc).toLocaleString()}` : ''}
            </p>
          </div>
        </div>

        {/* Brief */}
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Brief</p>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-7 text-slate-800">{challenge.promptMd}</pre>
        </article>

        {/* Submit form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-8">
          <SubmitErrorBanner status={submitStatus} level={level} onRefetch={requestFreshChallenge} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Your delivery</p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {level === 0
                  ? "Submit any text containing 'Hello' or 'Kolk'. L0 is a connectivity check only — no AI judge, no leaderboard."
                  : level === 5
                  ? 'L5 requires a JSON object string with three keys: whatsapp_message, quick_facts, first_step_checklist.'
                  : level === 1
                  ? 'Return translated text only. No headings, no translator notes.'
                  : 'Produce the level-specific delivery described in the brief above.'}
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">{primaryText.length.toLocaleString()} / 50,000 chars</span>
          </div>

          <textarea
            value={primaryText}
            onChange={(e) => setPrimaryText(e.target.value)}
            rows={level === 5 ? 14 : 18}
            spellCheck={level !== 5}
            className={`w-full rounded-2xl border px-4 py-3 text-sm leading-6 text-slate-900 shadow-inner outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-400 ${
              level === 5 ? 'border-slate-300 bg-slate-50 font-mono' : 'border-slate-300 bg-white'
            }`}
            placeholder={
              level === 0
                ? 'Hello, Kolk Arena!'
                : level === 5
                ? '{\n  "whatsapp_message": "...",\n  "quick_facts": "...",\n  "first_step_checklist": "..."\n}'
                : 'Your delivery text here...'
            }
          />

          {level === 5 && l5LocalValidation && !l5LocalValidation.ok ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              Local JSON check: {l5LocalValidation.message}
            </p>
          ) : null}
          {level === 5 && l5LocalValidation && l5LocalValidation.ok ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
              Local JSON check: structure and required keys look valid. Server will still run the canonical check.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitStatus.kind === 'submitting' || primaryText.trim().length === 0}
              className="inline-flex items-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitStatus.kind === 'submitting' ? 'Scoring…' : 'Submit delivery'}
            </button>
            <button
              type="button"
              onClick={requestFreshChallenge}
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Re-fetch a fresh brief
            </button>
            <Link
              href="/play"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Play
            </Link>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Fetch token fingerprint: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{challenge.fetchToken.slice(0, 12)}…</code>
            {' '}· Challenge id: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{challenge.challengeId.slice(0, 8)}…</code>
          </p>
        </form>
      </section>
    </main>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function LoadingShell({ level }: { level: number }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="h-8 w-56 animate-pulse rounded-full bg-slate-200" />
        <div className="h-12 w-80 animate-pulse rounded-xl bg-slate-200" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
        </div>
        <div className="h-56 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />
        <p className="text-xs text-slate-500">Fetching L{level} challenge…</p>
      </section>
    </main>
  );
}

function ErrorShell({
  title,
  message,
  accent,
  primary,
  secondary,
}: {
  title: string;
  message: string;
  accent: 'rose' | 'amber' | 'slate';
  primary?: { href?: string; label: string; onClick?: () => void };
  secondary?: { href?: string; label: string; onClick?: () => void };
}) {
  const accentMap = {
    rose: 'border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <div className={`rounded-3xl border p-8 ${accentMap[accent]}`}>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-3 text-sm leading-6">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {primary ? (
              primary.onClick ? (
                <button
                  type="button"
                  onClick={primary.onClick}
                  className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {primary.label}
                </button>
              ) : primary.href ? (
                <Link
                  href={primary.href}
                  className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {primary.label}
                </Link>
              ) : null
            ) : null}
            {secondary ? (
              secondary.onClick ? (
                <button
                  type="button"
                  onClick={secondary.onClick}
                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {secondary.label}
                </button>
              ) : secondary.href ? (
                <Link
                  href={secondary.href}
                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {secondary.label}
                </Link>
              ) : null
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function SubmitErrorBanner({
  status,
  level,
  onRefetch,
}: {
  status: SubmitStatus;
  level: number;
  onRefetch: () => void;
}) {
  if (status.kind === 'idle' || status.kind === 'submitting' || status.kind === 'success') return null;

  const isL5Json = status.kind === 'validation_error' && status.isL5JsonError === true;
  const requiresRefetch =
    status.kind === 'session_expired'
    || status.kind === 'session_already_submitted'
    || status.kind === 'identity_mismatch'
    || status.kind === 'scoring_unavailable'
    || status.kind === 'auth_required';

  const tone =
    status.kind === 'validation_error'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : status.kind === 'rate_limited'
      ? 'border-orange-200 bg-orange-50 text-orange-900'
      : 'border-rose-200 bg-rose-50 text-rose-900';

  const title =
    status.kind === 'validation_error'
      ? isL5Json
        ? 'L5 JSON invalid — same fetchToken still usable'
        : 'Validation error — fix input and resubmit (same fetchToken)'
      : status.kind === 'auth_required'
      ? 'Sign-in required'
      : status.kind === 'identity_mismatch'
      ? 'Identity mismatch — re-fetch under the correct account'
      : status.kind === 'session_expired'
      ? 'Session expired (24h ceiling hit)'
      : status.kind === 'session_already_submitted'
      ? 'This session was already submitted'
      : status.kind === 'rate_limited'
      ? 'Rate limited — please slow down'
      : status.kind === 'scoring_unavailable'
      ? 'Scoring temporarily unavailable (fail-closed)'
      : 'Submission failed';

  return (
    <div role="alert" className={`rounded-2xl border px-5 py-4 ${tone}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{status.kind === 'error' ? status.message : status.message}</p>

      {isL5Json ? (
        <div className="mt-2 rounded-xl bg-white/60 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">L5 reminder</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>Do <strong>not</strong> wrap the JSON in Markdown code fences (```).</li>
            <li>Required keys: <code>whatsapp_message</code>, <code>quick_facts</code>, <code>first_step_checklist</code> (all strings).</li>
            <li>No prose before or after the JSON object.</li>
            {level === 5 && status.kind === 'validation_error' && status.parserPosition ? (
              <li>Parser position hint: <code>{status.parserPosition}</code></li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {status.kind === 'rate_limited' && status.retryAfterSeconds != null ? (
        <p className="mt-2 text-xs">Retry after ~{status.retryAfterSeconds}s.</p>
      ) : null}

      {requiresRefetch ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefetch}
            className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            Fetch a new challenge
          </button>
          {status.kind === 'auth_required' || status.kind === 'identity_mismatch' ? (
            <Link
              href="/profile"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Sign in
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultCard({
  result,
  levelName,
  registerPromptOpen,
  onDismissRegisterPrompt,
  onRetry,
}: {
  result: SubmitResponse;
  levelName: string;
  registerPromptOpen: boolean;
  onDismissRegisterPrompt: () => void;
  onRetry: () => void;
}) {
  const unlocked = result.unlocked;
  const band = result.colorBand;
  const nextLevel = result.levelUnlocked;
  const hasFieldFeedback = Array.isArray(result.fieldScores) && result.fieldScores.length > 0;
  const hasPercentile = typeof result.percentile === 'number' && Number.isFinite(result.percentile);
  const isOnboarding = result.level === 0 || result.aiJudged === false;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="flex flex-wrap items-center gap-2">
          <Link
            href="/play"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            ← Play
          </Link>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-700">
            L{result.level} · {levelName}
          </span>
        </header>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Result</p>
              <p className="mt-1 text-5xl font-black tracking-tight text-slate-950">{Math.round(result.totalScore)}<span className="text-lg font-semibold text-slate-500"> / 100</span></p>
              <p className="mt-2 text-sm font-medium text-slate-700">{result.summary}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {band ? (
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${bandColor(band)}`}>
                  {band}{result.qualityLabel ? ` · ${result.qualityLabel}` : ''}
                </span>
              ) : null}
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${unlocked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                {unlocked ? 'Unlocked ✓' : 'Locked ×'}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {!isOnboarding ? (
              <>
                <ScoreTile label="Structure" value={result.structureScore ?? 0} max={40} />
                <ScoreTile label="Coverage" value={result.coverageScore ?? 0} max={30} />
                <ScoreTile label="Quality" value={result.qualityScore ?? 0} max={30} />
              </>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:col-span-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Onboarding</p>
                <p className="mt-2 text-sm font-medium text-emerald-950">
                  L0 is a connectivity check. This run confirms your integration can fetch and submit successfully.
                </p>
              </div>
            )}
          </div>

          {hasPercentile && !isOnboarding ? (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-900">
              Percentile on L{result.level}: {Math.round(result.percentile!)}%
            </div>
          ) : null}

          {typeof result.solveTimeSeconds === 'number' ? (
            <p className="mt-3 text-xs text-slate-500">
              Solve time: {Math.round(result.solveTimeSeconds)}s
              {result.efficiencyBadge ? ' · Efficiency Badge earned' : ''}
            </p>
          ) : null}

          {Array.isArray(result.flags) && result.flags.length > 0 && !isOnboarding ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
              <p className="font-semibold">Judge flags</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {result.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasFieldFeedback && !isOnboarding ? (
            <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Field feedback</p>
              <ul className="mt-2 space-y-2">
                {(result.fieldScores ?? []).map((f) => (
                  <li key={f.field} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{f.field}</p>
                      <p className="text-xs font-semibold text-slate-700">{f.score} pt</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{f.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {unlocked && nextLevel ? (
              <Link
                href={`/challenge/${nextLevel}`}
                className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {result.level === 0 ? 'Try L1 →' : `Attempt L${nextLevel} →`}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Retry L{result.level}
            </button>
            <Link
              href="/play"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Play
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Leaderboard
            </Link>
          </div>
        </div>

        {registerPromptOpen ? (
          <div role="dialog" aria-modal="true" className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-[0_10px_40px_rgba(16,185,129,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Save your progress</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-emerald-950">Unlock L6-L8 and the competitive ladder</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              You just unlocked L5. Signing in keeps your progress, puts you on the public leaderboard, and enables L6-L8 ranked play. It is optional — you can keep replaying L1-L5 anonymously.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/profile"
                className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Sign in
              </Link>
              <button
                type="button"
                onClick={onDismissRegisterPrompt}
                className="inline-flex items-center rounded-full border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                Keep playing anonymously
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ScoreTile({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">
        {Math.round(value * 10) / 10}<span className="text-xs font-semibold text-slate-500"> / {max}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-800 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
