'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import {
  formatClockSeconds,
  formatDateTime,
  formatNumber,
  formatTimeOnly,
} from '@/i18n/format';
import type { BetaPublicLevel } from '@/i18n/types';
import {
  buildChallengeAgentBrief,
  extractStructuredBrief,
  getLevelDeliveryInstruction,
  getLevelOutputTemplate,
  getStructuredBriefCopy,
  getSubmitContractSnippet,
} from '@/lib/frontend/agent-handoff';

// ============================================================================
// Types
// ============================================================================

type ChallengePackage = {
  challengeId: string;
  level: number;
  seed?: number;
  variant?: string;
  attemptToken: string;
  /** Legacy alias for attemptToken; one minor release only. */
  fetchToken?: string;
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
  replayAvailable?: boolean;
  replay?: boolean;
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
  failReason?: 'STRUCTURE_GATE' | 'QUALITY_FLOOR' | null;
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
  replayUnlocked?: boolean;
  nextSteps?: {
    replay: string;
    discord: string;
    share: string;
  };
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: FetchResponse }
  | { kind: 'auth_required'; message: string }
  | { kind: 'level_locked'; message: string; highestPassed?: number; nextLevel?: number }
  | { kind: 'level_already_passed'; message: string }
  | { kind: 'level_not_available'; message: string }
  | { kind: 'no_challenges'; message: string }
  | { kind: 'schema_not_ready'; message: string }
  | { kind: 'error'; message: string; code?: string };

// Shape of the `limits` block returned by the submission-guard layer (see
// `docs/SUBMISSION_API.md` §Error Codes and `src/lib/kolk/submission-guards.ts`).
// All counters are optional; only the windows that apply to a given response
// are populated. The client uses these to render precise budget context.
type SubmitLimits = {
  minute?: { used: number; max: number };
  hour?: { used: number; max: number };
  day?: { used: number; max: number };
  retry?: { used: number; max: number };
  fiveMinute?: { used: number; max: number };
};

type SubmitStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; result: SubmitResponse }
  | { kind: 'validation_error'; message: string; parserPosition?: string; isL5JsonError?: boolean }
  | { kind: 'auth_required'; message: string }
  | { kind: 'identity_mismatch'; message: string }
  | { kind: 'session_expired'; message: string }
  | { kind: 'session_already_submitted'; message: string }
  // Four distinct 429 codes; each has its own message + counter UX.
  | { kind: 'rate_limit_minute'; message: string; retryAfterSeconds?: number; limits?: SubmitLimits }
  | { kind: 'rate_limit_hour'; message: string; retryAfterSeconds?: number; limits?: SubmitLimits }
  | { kind: 'rate_limit_day'; message: string; retryAfterSeconds?: number; limits?: SubmitLimits }
  | { kind: 'retry_limit_exceeded'; message: string; limits?: SubmitLimits }
  // Full-screen abuse lockout; identity-scoped, 5h, not a cooldown.
  | { kind: 'account_frozen'; message: string; frozenUntil?: string; reason?: string; retryAfterSeconds?: number; limits?: SubmitLimits }
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
  return formatClockSeconds(total);
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
        } else if (resp.status === 403 && code === 'LEVEL_ALREADY_PASSED') {
          setFetchState({ kind: 'level_already_passed', message: msg });
        } else if (resp.status === 404 && code === 'LEVEL_NOT_AVAILABLE') {
          setFetchState({ kind: 'level_not_available', message: msg });
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
            attemptToken: fetchState.data.challenge.attemptToken,
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

        if (resp.status === 408 || code === 'ATTEMPT_TOKEN_EXPIRED' || code === 'SESSION_EXPIRED') {
          setSubmitStatus({ kind: 'session_expired', message });
          return;
        }

        if (resp.status === 409 && (code === 'ATTEMPT_ALREADY_PASSED' || code === 'SESSION_ALREADY_SUBMITTED')) {
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

        // Layered rate-limit / freeze surface. The submit route now emits four
        // distinct 429 codes + a 403 ACCOUNT_FROZEN, each with its own body
        // shape (see docs/SUBMISSION_API.md §Error Codes). The UI renders
        // distinct states per code so that the player sees the correct
        // counter context (per-minute vs per-hour vs per-day vs retry-cap)
        // and a full-screen lockout for identity-scoped freezes.
        const retryAfterHeader = resp.headers.get('retry-after');
        const headerRetry = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
        const bodyRetry =
          typeof (payload as { retryAfter?: unknown })?.retryAfter === 'number'
            ? (payload as { retryAfter: number }).retryAfter
            : NaN;
        const retryAfterSeconds = Number.isFinite(headerRetry)
          ? headerRetry
          : (Number.isFinite(bodyRetry) ? bodyRetry : undefined);
        const bodyLimits =
          payload && typeof (payload as { limits?: unknown }).limits === 'object'
            ? ((payload as { limits: SubmitLimits }).limits)
            : undefined;

        if (resp.status === 403 && code === 'ACCOUNT_FROZEN') {
          const frozenUntil =
            typeof (payload as { frozenUntil?: unknown })?.frozenUntil === 'string'
              ? (payload as { frozenUntil: string }).frozenUntil
              : undefined;
          const reason =
            typeof (payload as { reason?: unknown })?.reason === 'string'
              ? (payload as { reason: string }).reason
              : undefined;
          setSubmitStatus({ kind: 'account_frozen', message, frozenUntil, reason, retryAfterSeconds, limits: bodyLimits });
          return;
        }

        if (resp.status === 429) {
          if (code === 'RATE_LIMIT_MINUTE') {
            setSubmitStatus({ kind: 'rate_limit_minute', message, retryAfterSeconds, limits: bodyLimits });
            return;
          }
          if (code === 'RATE_LIMIT_HOUR') {
            setSubmitStatus({ kind: 'rate_limit_hour', message, retryAfterSeconds, limits: bodyLimits });
            return;
          }
          if (code === 'RATE_LIMIT_DAY') {
            setSubmitStatus({ kind: 'rate_limit_day', message, retryAfterSeconds, limits: bodyLimits });
            return;
          }
          if (code === 'RETRY_LIMIT_EXCEEDED') {
            setSubmitStatus({ kind: 'retry_limit_exceeded', message, limits: bodyLimits });
            return;
          }
          // Legacy RATE_LIMITED or any unrecognized 429 — fall back to the
          // per-minute cooldown UI so the player still sees a countdown.
          setSubmitStatus({ kind: 'rate_limit_minute', message, retryAfterSeconds, limits: bodyLimits });
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

  if (fetchState.kind === 'level_already_passed') {
    return (
      <ErrorShell
        title="Level already passed"
        accent="amber"
        message={fetchState.message}
        primary={{ href: '/play', label: 'Back to Play' }}
      />
    );
  }

  if (fetchState.kind === 'level_not_available') {
    return (
      <ErrorShell
        title="Level not available"
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
  const handoffLevel = level as BetaPublicLevel;
  const structuredBrief = extractStructuredBrief(challenge.taskJson);
  const agentBrief = buildChallengeAgentBrief({
    level: handoffLevel,
    levelName: level_info.name,
    promptMd: challenge.promptMd,
    taskJson: challenge.taskJson,
  });
  const outputTemplate = getLevelOutputTemplate(handoffLevel, challenge.taskJson);
  const structuredBriefCopy = getStructuredBriefCopy(challenge.taskJson);
  const submitContractSnippet = getSubmitContractSnippet(challenge.attemptToken);

  const deliveryRule = getLevelDeliveryInstruction(handoffLevel);

  const deliveryPlaceholder =
    level === 0
      ? copy.challenge.deliveryRules.placeholderLevel0
      : level === 5
      ? copy.challenge.deliveryRules.placeholderLevel5
      : copy.challenge.deliveryRules.placeholderDefault;

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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{copy.challenge.cards.suggestedTime}</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">
              {suggestedRemaining ? formatSeconds(suggestedRemaining.remainingSeconds) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {suggestedRemaining?.isOver
                ? copy.challenge.time.suggestedPastDue
                : copy.challenge.time.suggestedBadge(challenge.suggestedTimeMinutes ?? level_info.suggested_time_minutes)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{copy.challenge.cards.sessionDeadline}</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">
              {deadlineRemaining != null ? formatSeconds(deadlineRemaining) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {challenge.deadlineUtc ? copy.challenge.time.expiresAt(formatDateTime(challenge.deadlineUtc)) : ''}
            </p>
          </div>
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {copy.challenge.agentPanel.eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
              {copy.challenge.agentPanel.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {copy.challenge.agentPanel.body}
            </p>
            <ol className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
              {copy.challenge.agentPanel.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-3">
              <CopyButton
                value={agentBrief}
                idleLabel={copy.challenge.agentPanel.copyAgentBrief}
                copiedLabel={copy.challenge.agentPanel.copiedAgentBrief}
                failedLabel={copy.challenge.agentPanel.copyFailed}
                className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              />
              <CopyButton
                value={outputTemplate}
                idleLabel={copy.challenge.agentPanel.copyOutputTemplate}
                copiedLabel={copy.challenge.agentPanel.copiedOutputTemplate}
                failedLabel={copy.challenge.agentPanel.copyFailed}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              />
              <CopyButton
                value={structuredBriefCopy}
                idleLabel={structuredBrief ? copy.challenge.agentPanel.copyStructuredBrief : copy.challenge.agentPanel.copyTaskJson}
                copiedLabel={structuredBrief ? copy.challenge.agentPanel.copiedStructuredBrief : copy.challenge.agentPanel.copiedTaskJson}
                failedLabel={copy.challenge.agentPanel.copyFailed}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              />
              <CopyButton
                value={submitContractSnippet}
                idleLabel={copy.challenge.agentPanel.copySubmitContract}
                copiedLabel={copy.challenge.agentPanel.copiedSubmitContract}
                failedLabel={copy.challenge.agentPanel.copyFailed}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              />
            </div>
          </article>

          <aside className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-[0_10px_40px_rgba(16,185,129,0.10)] sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              {copy.challenge.agentPanel.challengeBriefEyebrow}
            </p>
            <p className="mt-2 text-sm leading-7 text-emerald-900">
              {copy.challenge.agentPanel.challengeBriefBody}
            </p>

            <details className="mt-4 rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3" open={Boolean(structuredBrief)}>
              <summary className="cursor-pointer text-sm font-semibold text-emerald-950">
                {structuredBrief ? copy.challenge.agentPanel.structuredBriefTitle : copy.challenge.agentPanel.taskJsonTitle}
              </summary>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-slate-100">
                {structuredBriefCopy}
              </pre>
            </details>
          </aside>
        </section>

        {/* Brief */}
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.challenge.cards.brief}</p>
            <CopyButton
              value={challenge.promptMd}
              idleLabel={copy.challenge.agentPanel.copyBriefText}
              copiedLabel={copy.challenge.agentPanel.copiedBriefText}
              failedLabel={copy.challenge.agentPanel.copyFailed}
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            />
          </div>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-7 text-slate-800">{challenge.promptMd}</pre>
        </article>

        {/* Submit form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.04)] sm:p-8">
          <SubmitErrorBanner status={submitStatus} level={level} onRefetch={requestFreshChallenge} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{copy.challenge.cards.yourDelivery}</p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {deliveryRule}
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500">{copy.challenge.deliveryRules.chars(formatNumber(primaryText.length))}</span>
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
              deliveryPlaceholder
            }
          />

          {level === 5 && l5LocalValidation && !l5LocalValidation.ok ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              {copy.challenge.deliveryRules.localJsonInvalid(l5LocalValidation.message)}
            </p>
          ) : null}
          {level === 5 && l5LocalValidation && l5LocalValidation.ok ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
              {copy.challenge.deliveryRules.localJsonValid}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitStatus.kind === 'submitting' || primaryText.trim().length === 0}
              className="inline-flex items-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitStatus.kind === 'submitting' ? copy.challenge.deliveryRules.scoring : copy.challenge.deliveryRules.submit}
            </button>
            <button
              type="button"
              onClick={requestFreshChallenge}
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {copy.challenge.deliveryRules.refetch}
            </button>
            <Link
              href="/play"
              className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {copy.challenge.deliveryRules.backToPlay}
            </Link>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            {copy.challenge.cards.attemptTokenFingerprint}: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{challenge.attemptToken.slice(0, 12)}…</code>
            {' '}· {copy.challenge.cards.challengeId}: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{challenge.challengeId.slice(0, 8)}…</code>
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

function LimitCounter({ label, used, max }: { label: string; used?: number; max?: number }) {
  if (typeof used !== 'number' || typeof max !== 'number') return null;
  return (
    <span className="inline-flex items-center rounded-full border border-current/30 bg-white/60 px-2 py-0.5 text-[11px] font-mono font-semibold">
      {label} {used}/{max}
    </span>
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

  // ACCOUNT_FROZEN is a full-screen lockout per FRONTEND_BETA_STATES, not an inline banner.
  if (status.kind === 'account_frozen') {
    return <AccountFrozenScreen status={status} />;
  }

  const isL5Json = status.kind === 'validation_error' && status.isL5JsonError === true;
  const requiresRefetch =
    status.kind === 'session_expired'
    || status.kind === 'session_already_submitted'
    || status.kind === 'identity_mismatch'
    || status.kind === 'scoring_unavailable'
    || status.kind === 'auth_required'
    || status.kind === 'retry_limit_exceeded';

  const isCooldown =
    status.kind === 'rate_limit_minute'
    || status.kind === 'rate_limit_hour'
    || status.kind === 'rate_limit_day';

  const tone =
    status.kind === 'validation_error'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : isCooldown
      ? 'border-orange-200 bg-orange-50 text-orange-900'
      : status.kind === 'retry_limit_exceeded'
      ? 'border-rose-200 bg-rose-50 text-rose-900'
      : 'border-rose-200 bg-rose-50 text-rose-900';

  const title =
    status.kind === 'validation_error'
      ? isL5Json
        ? 'L5 JSON invalid — same attemptToken still usable'
        : 'Validation error — fix input and resubmit (same attemptToken)'
      : status.kind === 'auth_required'
      ? 'Sign-in required'
      : status.kind === 'identity_mismatch'
      ? 'Identity mismatch — re-fetch under the correct account'
      : status.kind === 'session_expired'
      ? 'Session expired (24h ceiling hit)'
      : status.kind === 'session_already_submitted'
      ? 'This session was already submitted'
      : status.kind === 'rate_limit_minute'
      ? 'Too fast — 2 per minute per attemptToken'
      : status.kind === 'rate_limit_hour'
      ? 'Hourly cap — 20 per hour per attemptToken'
      : status.kind === 'rate_limit_day'
      ? 'Daily cap — 99 per day per account (resets at PT midnight)'
      : status.kind === 'retry_limit_exceeded'
      ? 'This attemptToken reached the 10-submit cap — fetch a new one'
      : status.kind === 'scoring_unavailable'
      ? 'Scoring temporarily unavailable (fail-closed)'
      : 'Submission failed';

  const limits = isCooldown || status.kind === 'retry_limit_exceeded' ? status.limits : undefined;

  return (
    <div role="alert" className={`rounded-2xl border px-5 py-4 ${tone}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{status.message}</p>

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

      {limits ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <LimitCounter label="minute" used={limits.minute?.used} max={limits.minute?.max} />
          <LimitCounter label="hour" used={limits.hour?.used} max={limits.hour?.max} />
          <LimitCounter label="day" used={limits.day?.used} max={limits.day?.max} />
          <LimitCounter label="retry" used={limits.retry?.used} max={limits.retry?.max} />
        </div>
      ) : null}

      {isCooldown && status.retryAfterSeconds != null ? (
        <p className="mt-2 text-xs">
          Retry after ~{status.retryAfterSeconds}s.
          {status.kind === 'rate_limit_hour' ? ' Continued rapid attempts may result in a 5-hour account freeze.' : ''}
        </p>
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

/**
 * Full-screen lockout for `403 ACCOUNT_FROZEN`. The freeze is identity-scoped
 * (per `docs/SUBMISSION_API.md` §Rate Limiting), so the lockout must apply at
 * the page level, not as an inline banner. A live countdown ticks down to
 * `frozenUntil`; there is deliberately no retry control until the freeze
 * window closes.
 */
function AccountFrozenScreen({
  status,
}: {
  status: Extract<SubmitStatus, { kind: 'account_frozen' }>;
}) {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (!status.frozenUntil) return null;
    const diff = new Date(status.frozenUntil).getTime() - Date.now();
    return Number.isFinite(diff) ? Math.max(0, Math.floor(diff / 1000)) : null;
  });

  useEffect(() => {
    if (!status.frozenUntil) return;
    const tick = () => {
      const diff = new Date(status.frozenUntil!).getTime() - Date.now();
      setRemaining(Number.isFinite(diff) ? Math.max(0, Math.floor(diff / 1000)) : null);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [status.frozenUntil]);

  const localTime = status.frozenUntil ? formatTimeOnly(status.frozenUntil) : null;

  return (
    <div role="alert" className="rounded-3xl border border-rose-300 bg-rose-50 px-6 py-8 text-rose-900">
      <p className="text-xl font-black tracking-tight">Account paused</p>
      <p className="mt-2 text-sm leading-6">
        You sent too many submissions too quickly. This pause applies to your whole account, not just this tab — fetching a new challenge will not unblock you.
      </p>
      {localTime ? (
        <p className="mt-3 text-sm">
          Submissions unpause at <strong>{localTime}</strong> (local time).
        </p>
      ) : null}
      {remaining != null ? (
        <p className="mt-2 font-mono text-2xl font-bold">{formatSeconds(remaining)}</p>
      ) : null}
      {status.reason ? (
        <p className="mt-3 text-xs italic text-rose-800">Reason: {status.reason}</p>
      ) : null}
      {status.limits ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <LimitCounter label="day" used={status.limits.day?.used} max={status.limits.day?.max} />
          <LimitCounter label="1-min burst" used={status.limits.minute?.used} max={status.limits.minute?.max} />
          <LimitCounter label="5-min burst" used={status.limits.fiveMinute?.used} max={status.limits.fiveMinute?.max} />
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
  const failReasonLabel =
    result.failReason === 'STRUCTURE_GATE'
      ? 'Structure gate not cleared'
      : result.failReason === 'QUALITY_FLOOR'
      ? 'Coverage + quality floor not cleared'
      : null;

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

          {!unlocked && failReasonLabel ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
              Unlock blocked: {failReasonLabel}.
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

        {result.replayUnlocked && result.nextSteps ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-[0_10px_40px_rgba(16,185,129,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Beta complete</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-emerald-950">Replay mode unlocked</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{result.nextSteps.replay}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={result.nextSteps.discord}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Join Discord
              </a>
              <a
                href={result.nextSteps.share}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Share result
              </a>
            </div>
          </div>
        ) : null}

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
