'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { copy } from '@/i18n';
import {
  formatClockSeconds,
  formatDateTime,
  formatNumber,
  formatTimeOnly,
} from '@/i18n/format';
import type { BetaPublicLevel, ErrorCode, ScriptLang } from '@/i18n/types';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import {
  buildChallengeAgentBrief,
  extractStructuredBrief,
  getChallengeScriptBundle,
  getLevelDeliveryInstruction,
  getLevelOutputTemplate,
  getStructuredBriefCopy,
  getSubmitContractSnippet,
  getAgentRules,
  dryRunValidation,
} from '@/lib/frontend/agent-handoff';
import { usePublicTextAsset } from '@/lib/frontend/use-public-text-asset';
import { MAX_PRIMARY_TEXT_CHARS } from '@/lib/kolk/constants';

/**
 * Map a server-emitted error code → localized UI message. The wire-side
 * English `body.error` is preserved as a graceful fallback when the code is
 * missing or unrecognized.
 */
function resolveServerError(message: string, code: string | undefined): string {
  if (!code) return message;
  const localized = copy.errors[code as ErrorCode];
  return typeof localized === 'string' ? localized : message;
}

function resolveServerMessage(payload: { error?: unknown; code?: unknown; fix_hint?: unknown }, fallback: string): string {
  const rawMessage = typeof payload.error === 'string' ? payload.error : fallback;
  const code = typeof payload.code === 'string' ? payload.code : undefined;
  const localized = resolveServerError(rawMessage, code);
  const fixHint = typeof payload.fix_hint === 'string' && payload.fix_hint.trim().length > 0 ? payload.fix_hint.trim() : null;
  return fixHint ? `${localized} ${fixHint}` : localized;
}

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

const panelLayoutStorage = {
  getItem(key: string) {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
};

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
    case 'RED': return 'border-2 border-rose-700 bg-rose-50 text-rose-800';
    case 'ORANGE': return 'border-2 border-orange-700 bg-orange-50 text-orange-800';
    case 'YELLOW': return 'border-2 border-amber-700 bg-amber-50 text-amber-800';
    case 'GREEN': return 'border-2 border-emerald-700 bg-emerald-50 text-emerald-800';
    case 'BLUE': return 'border-2 border-sky-700 bg-sky-50 text-sky-800';
    default: return 'border border-slate-200 bg-slate-50 text-slate-800';
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
  const [scriptTab, setScriptTab] = useState<'curl'|'python'|'node'>('curl');
  const [dryRunResult, setDryRunResult] = useState<{valid: boolean; errors: string[]; warnings: string[]} | null>(null);
  const skillContent = usePublicTextAsset('/kolk_arena.md');
  const idempotencyKeyRef = useRef<string>('');
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `challenge-layout-l${level}`,
    panelIds: ['challenge-brief-pane', 'challenge-console-pane'],
    storage: panelLayoutStorage,
  });

  const handleDryRun = useCallback(() => {
    const result = dryRunValidation(level, primaryText);
    setDryRunResult(result);
    return result;
  }, [level, primaryText]);

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const requestFreshChallenge = useCallback(() => {
    setSubmitStatus({ kind: 'idle' });
    setRegisterPromptOpen(false);
    setPrimaryText(level === 0 ? 'Hello, Kolk Arena!' : '');
    setDryRunResult(null);
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
        const rawMsg: string = typeof payload?.error === 'string' ? payload.error : `Request failed (${resp.status})`;
        const msg: string = resolveServerError(rawMsg, code);

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
          message:
            err instanceof Error
              ? err.message
              : copy.challenge.errorStates.couldNotLoad,
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
          message: copy.challenge.dryRun.primaryTextEmpty,
        });
        return;
      }

      const preflight = handleDryRun();
      if (preflight.errors.length > 0) {
        setSubmitStatus({
          kind: 'validation_error',
          message: preflight.errors[0],
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
        const message = resolveServerMessage(
          payload as { error?: unknown; code?: unknown; fix_hint?: unknown },
          copy.challenge.submitBanner.submitFailed,
        );

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
            message: copy.challenge.submitBanner.duplicateRequest,
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
          message:
            err instanceof Error
              ? err.message
              : copy.challenge.submitBanner.submitFailed,
        });
      }
    },
    [fetchState, handleDryRun, level, primaryText],
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
        title={copy.challenge.errorStates.authRequired}
        accent="rose"
        message={fetchState.message}
        primary={{ href: '/profile', label: copy.challenge.errorStates.signInLabel }}
        secondary={{ href: '/play', label: copy.challenge.errorStates.backToPlayLabel }}
      />
    );
  }

  if (fetchState.kind === 'level_locked') {
    const nextL = fetchState.nextLevel ?? (fetchState.highestPassed ?? 0) + 1;
    return (
      <ErrorShell
        title={copy.challenge.errorStates.levelLockedTitle(level)}
        accent="amber"
        message={fetchState.message}
        primary={{ href: `/challenge/${nextL}`, label: copy.challenge.errorStates.tryNextLevel(nextL) }}
        secondary={{ href: '/play', label: copy.challenge.errorStates.backToPlayLabel }}
      />
    );
  }

  if (fetchState.kind === 'level_already_passed') {
    return (
      <ErrorShell
        title={copy.challenge.errorStates.levelAlreadyPassed}
        accent="amber"
        message={fetchState.message}
        primary={{ href: '/play', label: copy.challenge.errorStates.backToPlayLabel }}
      />
    );
  }

  if (fetchState.kind === 'level_not_available') {
    return (
      <ErrorShell
        title={copy.challenge.errorStates.levelNotAvailable}
        accent="slate"
        message={fetchState.message}
        primary={{ href: '/play', label: copy.challenge.errorStates.levelsCta }}
      />
    );
  }

  if (fetchState.kind === 'no_challenges') {
    return (
      <ErrorShell
        title={copy.challenge.errorStates.noChallenges}
        accent="amber"
        message={fetchState.message}
        primary={{ label: copy.challenge.errorStates.retryLabel, onClick: requestFreshChallenge }}
        secondary={{ href: '/play', label: copy.challenge.errorStates.backToPlayLabel }}
      />
    );
  }

  if (fetchState.kind === 'schema_not_ready') {
    return (
      <ErrorShell
        title={copy.challenge.errorStates.schemaNotReady}
        accent="rose"
        message={fetchState.message}
        primary={{ label: copy.challenge.errorStates.retryLabel, onClick: requestFreshChallenge }}
        secondary={{ href: '/play', label: copy.challenge.errorStates.backToPlayLabel }}
      />
    );
  }

  if (fetchState.kind === 'error') {
    return (
      <ErrorShell
        title={copy.challenge.errorStates.couldNotLoad}
        accent="rose"
        message={fetchState.message}
        primary={{ label: copy.challenge.errorStates.retryLabel, onClick: requestFreshChallenge }}
        secondary={{ href: '/play', label: copy.challenge.errorStates.backToPlayLabel }}
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
  const challengePageUrl = `${APP_CONFIG.canonicalOrigin}/challenge/${level}`;
  const outputTemplate = getLevelOutputTemplate(handoffLevel, challenge.taskJson);
  const structuredBriefCopy = getStructuredBriefCopy(challenge.taskJson);
  const submitContractSnippet = getSubmitContractSnippet(challenge.attemptToken, handoffLevel);
  const activeScriptLang = scriptTab as ScriptLang;
  const scriptBundle = getChallengeScriptBundle(activeScriptLang, handoffLevel);

  const deliveryRule = getLevelDeliveryInstruction(handoffLevel);

  const deliveryPlaceholder =
    level === 0
      ? copy.challenge.deliveryRules.placeholderLevel0
      : level === 5
      ? copy.challenge.deliveryRules.placeholderLevel5
      : copy.challenge.deliveryRules.placeholderDefault;

  const timerCards = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`rounded-md border-2 p-4 ${suggestedRemaining && suggestedRemaining.isOver ? 'border-amber-700 bg-amber-50' : 'border-slate-950 bg-white'}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">{copy.challenge.cards.suggestedTime}</p>
        <p className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-950">
          {suggestedRemaining ? formatSeconds(suggestedRemaining.remainingSeconds) : '—'}
        </p>
        <p className="mt-1 font-mono text-xs text-slate-700">
          {suggestedRemaining?.isOver
            ? copy.challenge.time.suggestedPastDue
            : copy.challenge.time.suggestedBadge(challenge.suggestedTimeMinutes ?? level_info.suggested_time_minutes)}
        </p>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">{copy.challenge.cards.sessionDeadline}</p>
        <p className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-950">
          {deadlineRemaining != null ? formatSeconds(deadlineRemaining) : '—'}
        </p>
        <p className="mt-1 font-mono text-xs text-slate-700">
          {challenge.deadlineUtc ? copy.challenge.time.expiresAt(formatDateTime(challenge.deadlineUtc)) : ''}
        </p>
      </div>
    </div>
  );

  const briefCard = (
    <CodeBlock
      eyebrow={copy.challenge.cards.brief}
      code={challenge.promptMd}
      copyValue={challenge.promptMd}
      copyLabel={copy.challenge.agentPanel.copyBriefText}
      copiedLabel={copy.challenge.agentPanel.copiedBriefText}
      failedLabel={copy.challenge.agentPanel.copyFailed}
      tone="light"
    />
  );

  const agentConsole = (
    <section className="space-y-4">
      <article className="min-w-0 rounded-md border border-slate-200 bg-white p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
          {copy.challenge.agentPanel.eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
          {copy.challenge.agentPanel.title}
        </h2>
        <p className="mt-2 text-sm leading-7 text-slate-700">
          {copy.challenge.agentPanel.body}
        </p>
        <ol className="mt-4 space-y-2 text-sm leading-6 text-slate-800">
          {copy.challenge.agentPanel.steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-950 font-mono text-xs font-semibold text-white">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
          {copy.challenge.agentPanel.browserModeNote}
        </p>

        <section className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
            {copy.challenge.agentPanel.directActionsEyebrow}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {copy.challenge.agentPanel.directActionsBody}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <CopyButton
              value={agentBrief}
              idleLabel={copy.challenge.agentPanel.copyAgentBrief}
              copiedLabel={copy.challenge.agentPanel.copiedAgentBrief}
              failedLabel={copy.challenge.agentPanel.copyFailed}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-slate-950 px-6 py-3 font-mono text-sm font-bold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950 sm:w-auto"
            />
            <CopyButton
              value={challengePageUrl}
              idleLabel={copy.challenge.agentPanel.copyChallengeUrl}
              copiedLabel={copy.challenge.agentPanel.copiedChallengeUrl}
              failedLabel={copy.challenge.agentPanel.copyFailed}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
            />
            <a
              href="/kolk_arena.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
            >
              {copy.homeInteractive.openSkill}
            </a>
          </div>
        </section>

        <details className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3" open={Boolean(structuredBrief)}>
          <summary className="cursor-pointer font-mono text-sm font-semibold text-emerald-950">
            {structuredBrief ? copy.challenge.agentPanel.structuredBriefTitle : copy.challenge.agentPanel.taskJsonTitle}
          </summary>
          <p className="mt-3 text-sm leading-6 text-emerald-900">
            {copy.challenge.agentPanel.challengeBriefBody}
          </p>
          <CodeBlock
            code={structuredBriefCopy}
            tone="dark"
            className="mt-3"
          />
        </details>

        <details className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
            {copy.challenge.agentPanel.supportAssetsEyebrow}
          </summary>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {copy.challenge.agentPanel.supportAssetsBody}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <CopyButton
              value={submitContractSnippet}
              idleLabel={copy.challenge.agentPanel.copySubmitContract}
              copiedLabel={copy.challenge.agentPanel.copiedSubmitContract}
              failedLabel={copy.challenge.agentPanel.copyFailed}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
            />
            <CopyButton
              value={outputTemplate}
              idleLabel={copy.challenge.agentPanel.copyOutputTemplate}
              copiedLabel={copy.challenge.agentPanel.copiedOutputTemplate}
              failedLabel={copy.challenge.agentPanel.copyFailed}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
            />
            <CopyButton
              value={structuredBriefCopy}
              idleLabel={structuredBrief ? copy.challenge.agentPanel.copyStructuredBrief : copy.challenge.agentPanel.copyTaskJson}
              copiedLabel={structuredBrief ? copy.challenge.agentPanel.copiedStructuredBrief : copy.challenge.agentPanel.copiedTaskJson}
              failedLabel={copy.challenge.agentPanel.copyFailed}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
            />
            <button
              type="button"
              onClick={() => downloadFile(copy.challenge.agentPanel.agentRulesFilename, getAgentRules())}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white sm:w-auto"
            >
              {copy.challenge.agentPanel.downloadAgentRules}
            </button>
            <button
              type="button"
              onClick={() => skillContent && downloadFile('kolk_arena.md', skillContent)}
              disabled={!skillContent}
              className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {copy.homeInteractive.downloadSkill}
            </button>
          </div>
        </details>

        <details className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
            {copy.challenge.agentPanel.scriptToolkitEyebrow}
          </summary>
          <div className="px-4 py-4">
            <p className="text-sm leading-6 text-slate-700">
              {copy.challenge.agentPanel.scriptToolkitBody}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CopyButton
                value={scriptBundle.code}
                idleLabel={copy.challenge.agentPanel.copyScriptButton(activeScriptLang)}
                copiedLabel={copy.challenge.agentPanel.copiedScriptButton}
                failedLabel={copy.challenge.agentPanel.copyScriptFailed}
                className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
              />
              <button
                type="button"
                onClick={() => downloadFile(scriptBundle.filename, scriptBundle.code)}
                className="inline-flex min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
              >
                {copy.challenge.agentPanel.downloadScriptButton}
              </button>
            </div>
          </div>
          <div className="border-y border-slate-200 bg-slate-100 p-2">
            <div
              role="tablist"
              aria-label={copy.challenge.agentPanel.scriptTabListAriaLabel}
              className="flex flex-wrap gap-2"
            >
              <button
                type="button"
                role="tab"
                aria-selected={scriptTab === 'curl'}
                onClick={() => setScriptTab('curl')}
                className={`rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors duration-150 ${scriptTab === 'curl' ? 'bg-slate-950 text-white' : 'bg-white text-slate-950 hover:bg-slate-950 hover:text-white'}`}
              >
                {copy.challenge.agentPanel.scriptTabs.curl}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scriptTab === 'python'}
                onClick={() => setScriptTab('python')}
                className={`rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors duration-150 ${scriptTab === 'python' ? 'bg-slate-950 text-white' : 'bg-white text-slate-950 hover:bg-slate-950 hover:text-white'}`}
              >
                {copy.challenge.agentPanel.scriptTabs.python}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scriptTab === 'node'}
                onClick={() => setScriptTab('node')}
                className={`rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors duration-150 ${scriptTab === 'node' ? 'bg-slate-950 text-white' : 'bg-white text-slate-950 hover:bg-slate-950 hover:text-white'}`}
              >
                {copy.challenge.agentPanel.scriptTabs.node}
              </button>
            </div>
          </div>
          <div className="min-w-0 space-y-4 p-4">
            {scriptBundle.steps.map((step, index) => (
              <CodeBlock
                key={`${scriptTab}-${step.title}`}
                title={`#${index + 1} · ${step.title}`}
                code={step.code}
                copyValue={step.code}
                copyLabel={`${copy.common.copyThisStep} #${index + 1}`}
                copiedLabel={copy.common.copied}
                failedLabel={copy.common.copyFailed}
                tone="light"
                wrap={false}
              />
            ))}
          </div>
        </details>
      </article>
    </section>
  );

  const submitCard = (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-slate-200 bg-white p-6 sm:p-8">
      <SubmitErrorBanner status={submitStatus} level={level} onRefetch={requestFreshChallenge} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{copy.challenge.cards.yourDelivery}</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {deliveryRule}
          </p>
        </div>
        <span className="font-mono text-xs font-medium text-slate-700">{copy.challenge.deliveryRules.chars(formatNumber(primaryText.length))}</span>
      </div>

      <textarea
        value={primaryText}
        onChange={(e) => setPrimaryText(e.target.value)}
        rows={level === 5 ? 14 : 18}
        spellCheck={level !== 5}
        // Matches the server cap in `src/lib/kolk/constants/index.ts`. The
        // submit route still hard-enforces via HTTP 422 TEXT_TOO_LONG, but
        // stopping over-long pastes at the input saves the round-trip and
        // makes the failure mode legible to the user.
        maxLength={MAX_PRIMARY_TEXT_CHARS}
        className="w-full rounded-md border border-slate-200 bg-slate-950 p-4 font-mono tabular-nums text-slate-100 outline-none transition focus:ring-2 focus:ring-emerald-500"
        placeholder={deliveryPlaceholder}
      />

      {level === 5 && l5LocalValidation && !l5LocalValidation.ok ? (
        <p className="rounded-md border-2 border-amber-700 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
          {copy.challenge.deliveryRules.localJsonInvalid(l5LocalValidation.message)}
        </p>
      ) : null}
      {level === 5 && l5LocalValidation && l5LocalValidation.ok ? (
        <p className="rounded-md border-2 border-emerald-700 bg-emerald-50 px-4 py-3 font-mono text-xs font-medium text-emerald-800">
          {copy.challenge.deliveryRules.localJsonValid}
        </p>
      ) : null}

      {dryRunResult && !dryRunResult.valid && (
        <div className="rounded-md border-2 border-amber-700 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
          <p className="font-semibold">{copy.challenge.dryRun.failedHeading}</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {dryRunResult.errors.map(err => <li key={err}>{err}</li>)}
          </ul>
        </div>
      )}
      {dryRunResult?.warnings.length ? (
        <div className="rounded-md border-2 border-sky-700 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-900">
          <p className="font-semibold">{copy.challenge.dryRun.warningHeading}</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {dryRunResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}
      {dryRunResult && dryRunResult.valid && dryRunResult.warnings.length === 0 && (
        <p className="rounded-md border-2 border-emerald-700 bg-emerald-50 px-4 py-3 font-mono text-xs font-medium text-emerald-800">
          {copy.challenge.dryRun.passedMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleDryRun}
          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
        >
          {copy.challenge.dryRun.validateButton}
        </button>
        <button
          type="submit"
          disabled={submitStatus.kind === 'submitting' || primaryText.trim().length === 0}
          className="memory-accent-button inline-flex items-center rounded-md border px-6 py-3 font-mono text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitStatus.kind === 'submitting' ? copy.challenge.deliveryRules.scoring : copy.challenge.deliveryRules.submit}
        </button>
        <button
          type="button"
          onClick={requestFreshChallenge}
          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
        >
          {copy.challenge.deliveryRules.refetch}
        </button>
        <Link
          href="/play"
          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
        >
          {copy.challenge.deliveryRules.backToPlay}
        </Link>
      </div>
      <p className="font-mono text-xs leading-5 text-slate-700">
        {copy.challenge.cards.attemptTokenFingerprint}: <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-950">{challenge.attemptToken.slice(0, 12)}…</code>
        {' '}· {copy.challenge.cards.challengeId}: <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-950">{challenge.challengeId.slice(0, 8)}…</code>
      </p>
    </form>
  );

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
      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/play"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1 font-mono text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
            >
              {copy.challenge.header.backToPlay}
            </Link>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] tabular-nums font-semibold uppercase tracking-[0.2em] text-slate-950">
              {copy.challenge.header.levelBand(level, level_info.band)}
            </span>
            {level_info.is_boss ? (
              <span className="inline-flex items-center rounded-md border-2 border-rose-700 bg-rose-50 px-3 py-1 text-[10px] tabular-nums font-semibold uppercase tracking-[0.2em] text-rose-800">
                {copy.challenge.header.bossLevel}
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{level_info.name}</h1>
          {boss_hint ? (
            <p className="text-sm leading-6 text-rose-800">{boss_hint}</p>
          ) : null}
          {replay_warning ? (
            <p className="text-sm leading-6 text-amber-800">{replay_warning}</p>
          ) : null}
        </header>

        <div className="min-w-0 space-y-6 xl:hidden">
          {timerCards}
          {briefCard}
          {agentConsole}
          {submitCard}
        </div>

        <div className="hidden xl:block">
          <Group
            id={`challenge-layout-l${level}`}
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="min-h-[820px] rounded-md border border-slate-200 bg-white"
          >
            <Panel id="challenge-brief-pane" defaultSize={42} minSize={30}>
              <div className="h-full min-w-0 overflow-y-auto bg-slate-50 p-6 xl:p-8 space-y-6">
                {timerCards}
                {briefCard}
              </div>
            </Panel>
            {/*
              Thin, GitHub-style divider. Was `w-3` with `border-x-2
              border-slate-950` + an inner `w-px bg-slate-950`, which
              painted three stacked dark lines down the middle of the
              page. Now a single 1 px slate-200 hairline that thickens
              to slate-400 on hover so the resize handle is still
              discoverable. Kept `cursor-col-resize` on the outer
              slot so the hit target stays 8 px wide.
            */}
            <Separator className="group relative flex w-2 cursor-col-resize items-stretch justify-center bg-transparent">
              <div className="w-px bg-slate-200 transition-colors group-hover:bg-slate-400" />
            </Separator>
            <Panel id="challenge-console-pane" defaultSize={58} minSize={34}>
              <div className="h-full min-w-0 overflow-y-auto bg-white p-6 xl:p-8 space-y-6">
                {agentConsole}
                {submitCard}
              </div>
            </Panel>
          </Group>
        </div>
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
        <div className="h-8 w-56 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <div className="h-12 w-80 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
          <div className="h-24 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        </div>
        <div className="h-56 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <div className="h-40 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <p className="font-mono text-xs text-slate-700">{copy.challenge.errorStates.fetchingChallenge(level)}</p>
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
    rose: 'border-rose-700 bg-rose-50 text-rose-800',
    amber: 'border-amber-700 bg-amber-50 text-amber-800',
    slate: 'border-slate-950 bg-slate-50 text-slate-800',
  };
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <div className={`rounded-md border-2 p-8 ${accentMap[accent]}`}>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-3 text-sm leading-6">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {primary ? (
              primary.onClick ? (
                <button
                  type="button"
                  onClick={primary.onClick}
                  className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 font-mono text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
                >
                  {primary.label}
                </button>
              ) : primary.href ? (
                <Link
                  href={primary.href}
                  className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 font-mono text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
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
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
                >
                  {secondary.label}
                </button>
              ) : secondary.href ? (
                <Link
                  href={secondary.href}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
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
    <span className="inline-flex items-center rounded-md border-2 border-current bg-white px-2 py-0.5 font-mono text-[11px] tabular-nums font-semibold">
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
      ? 'border-amber-700 bg-amber-50 text-amber-900'
      : isCooldown
      ? 'border-orange-700 bg-orange-50 text-orange-900'
      : status.kind === 'retry_limit_exceeded'
      ? 'border-rose-700 bg-rose-50 text-rose-900'
      : 'border-rose-700 bg-rose-50 text-rose-900';

  const sb = copy.challenge.submitBanner;
  const title =
    status.kind === 'validation_error'
      ? isL5Json
        ? sb.validationTitleL5Json
        : sb.validationTitleStandard
      : status.kind === 'auth_required'
      ? sb.authRequiredTitle
      : status.kind === 'identity_mismatch'
      ? sb.identityMismatchTitle
      : status.kind === 'session_expired'
      ? sb.sessionExpiredTitle
      : status.kind === 'session_already_submitted'
      ? sb.sessionAlreadySubmittedTitle
      : status.kind === 'rate_limit_minute'
      ? sb.rateLimitMinuteTitle
      : status.kind === 'rate_limit_hour'
      ? sb.rateLimitHourTitle
      : status.kind === 'rate_limit_day'
      ? sb.rateLimitDayTitle
      : status.kind === 'retry_limit_exceeded'
      ? sb.retryLimitExceededTitle
      : status.kind === 'scoring_unavailable'
      ? sb.scoringUnavailableTitle
      : sb.submissionFailedTitle;

  const limits = isCooldown || status.kind === 'retry_limit_exceeded' ? status.limits : undefined;

  return (
    <div role="alert" className={`rounded-md border-2 px-5 py-4 ${tone}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{status.message}</p>

      {isL5Json ? (
        <div className="mt-2 rounded-md border-2 border-amber-700 bg-white px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">{sb.l5ReminderHeading}</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>{sb.l5ReminderNoFences}</li>
            <li>{sb.l5ReminderRequiredKeys}</li>
            <li>{sb.l5ReminderNoProse}</li>
            {level === 5 && status.kind === 'validation_error' && status.parserPosition ? (
              <li>{sb.l5ReminderParserHint(status.parserPosition)}</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {limits ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <LimitCounter label={sb.counterMinute} used={limits.minute?.used} max={limits.minute?.max} />
          <LimitCounter label={sb.counterHour} used={limits.hour?.used} max={limits.hour?.max} />
          <LimitCounter label={sb.counterDay} used={limits.day?.used} max={limits.day?.max} />
          <LimitCounter label={sb.counterRetry} used={limits.retry?.used} max={limits.retry?.max} />
        </div>
      ) : null}

      {isCooldown && status.retryAfterSeconds != null ? (
        <p className="mt-2 font-mono text-xs">
          {sb.retryAfter(status.retryAfterSeconds)}
          {status.kind === 'rate_limit_hour' ? sb.hourFreezeWarning : ''}
        </p>
      ) : null}

      {requiresRefetch ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefetch}
            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-4 py-2 font-mono text-xs font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
          >
            {sb.fetchNewChallenge}
          </button>
          {status.kind === 'auth_required' || status.kind === 'identity_mismatch' ? (
            <Link
              href="/profile"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 font-mono text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
            >
              {sb.signIn}
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

  const af = copy.challenge.accountFrozen;
  const sb = copy.challenge.submitBanner;
  return (
    <div role="alert" className="rounded-md border-2 border-rose-700 bg-rose-50 px-6 py-8 text-rose-900">
      <p className="text-xl font-black tracking-tight">{af.title}</p>
      <p className="mt-2 text-sm leading-6">{af.body}</p>
      {localTime ? (
        <p className="mt-3 font-mono text-sm">{af.unpauseAt(localTime)}</p>
      ) : null}
      {remaining != null ? (
        <p className="mt-2 font-mono tabular-nums text-2xl font-bold">{formatSeconds(remaining)}</p>
      ) : null}
      {status.reason ? (
        <p className="mt-3 text-xs italic text-rose-800">{af.reasonPrefix}{status.reason}</p>
      ) : null}
      {status.limits ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <LimitCounter label={sb.counterDay} used={status.limits.day?.used} max={status.limits.day?.max} />
          <LimitCounter label={sb.counterMinuteBurst} used={status.limits.minute?.used} max={status.limits.minute?.max} />
          <LimitCounter label={sb.counterFiveMinuteBurst} used={status.limits.fiveMinute?.used} max={status.limits.fiveMinute?.max} />
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
  const r = copy.challenge.result;
  const failReasonLabel =
    result.failReason === 'STRUCTURE_GATE'
      ? r.structureGateFailed
      : result.failReason === 'QUALITY_FLOOR'
      ? r.qualityFloorFailed
      : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="flex flex-wrap items-center gap-2">
          <Link
            href="/play"
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1 font-mono text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
          >
            {copy.challenge.header.backToPlay}
          </Link>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-[10px] tabular-nums font-semibold uppercase tracking-[0.2em] text-slate-950">
            {copy.challenge.header.resultLevelTitle(result.level, levelName)}
          </span>
        </header>

        <div className="rounded-md border border-slate-200 bg-white p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{r.eyebrow}</p>
              <p className="mt-1 text-5xl font-black tracking-tight text-slate-950">{Math.round(result.totalScore)}<span className="font-mono text-lg font-semibold text-slate-700">{r.scoreOutOf(100)}</span></p>
              <p className="mt-2 text-sm font-medium text-slate-800">{result.summary}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {band ? (
                <span className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${bandColor(band)}`}>
                  {band}{result.qualityLabel ? ` · ${result.qualityLabel}` : ''}
                </span>
              ) : null}
              <span className={`inline-flex items-center rounded-md border-2 px-3 py-1 font-mono text-xs font-semibold ${unlocked ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-rose-700 bg-rose-50 text-rose-800'}`}>
                {unlocked ? r.unlocked : r.locked}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {!isOnboarding ? (
              <>
                <ScoreTile label={r.structureLabel} value={result.structureScore ?? 0} max={40} />
                <ScoreTile label={r.coverageLabel} value={result.coverageScore ?? 0} max={30} />
                <ScoreTile label={r.qualityLabel} value={result.qualityScore ?? 0} max={30} />
              </>
            ) : (
              <div className="rounded-md border-2 border-emerald-700 bg-emerald-50 p-4 font-mono tabular-nums text-emerald-800 sm:col-span-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">{r.onboardingEyebrow}</p>
                <p className="mt-2 text-sm font-medium text-emerald-950">{r.onboardingBody}</p>
              </div>
            )}
          </div>

          {hasPercentile && !isOnboarding ? (
            <div className="mt-4 rounded-md border-2 border-sky-700 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-900">
              {r.percentile(result.level, Math.round(result.percentile!))}
            </div>
          ) : null}

          {!unlocked && failReasonLabel ? (
            <div className="mt-4 rounded-md border-2 border-amber-700 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
              {r.unlockBlockedPrefix}{failReasonLabel}.
            </div>
          ) : null}

          {typeof result.solveTimeSeconds === 'number' ? (
            <p className="mt-3 font-mono text-xs text-slate-700">
              {r.solveTime(Math.round(result.solveTimeSeconds))}
              {result.efficiencyBadge ? r.efficiencyEarned : ''}
            </p>
          ) : null}

          {Array.isArray(result.flags) && result.flags.length > 0 && !isOnboarding ? (
            <div className="mt-4 rounded-md border-2 border-amber-700 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
              <p className="font-semibold">{r.judgeFlagsHeading}</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {result.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasFieldFeedback && !isOnboarding ? (
            <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{r.fieldFeedbackHeading}</p>
              <ul className="mt-2 space-y-2">
                {(result.fieldScores ?? []).map((f) => (
                  <li key={f.field} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{f.field}</p>
                      <p className="font-mono text-xs font-semibold text-slate-800">{f.score}{r.pointsSuffix}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{f.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {unlocked && nextLevel ? (
              <Link
                href={`/challenge/${nextLevel}`}
                className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 font-mono text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
              >
                {r.tryNextLevel(nextLevel)}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
            >
              {r.retryLevel(result.level)}
            </button>
            <Link
              href="/play"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
            >
              {r.backToPlay}
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
            >
              {r.leaderboard}
            </Link>
          </div>
        </div>

        {result.replayUnlocked && result.nextSteps ? (
          <div className="rounded-md border-2 border-emerald-700 bg-emerald-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">{r.replayEyebrow}</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-emerald-950">{r.replayTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{result.nextSteps.replay}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={result.nextSteps.discord}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-5 py-3 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
              >
                {r.joinDiscord}
              </a>
              <a
                href={result.nextSteps.share}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
              >
                {r.shareResult}
              </a>
            </div>
          </div>
        ) : null}

        {registerPromptOpen ? (
          <div role="dialog" aria-modal="true" className="rounded-md border-2 border-emerald-700 bg-emerald-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">{r.registerEyebrow}</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-emerald-950">{r.registerTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{r.registerBody}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/profile"
                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-5 py-3 font-mono text-sm font-semibold text-white transition-colors duration-150 hover:bg-white hover:text-slate-950"
              >
                {r.registerCta}
              </Link>
              <button
                type="button"
                onClick={onDismissRegisterPrompt}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 font-mono text-sm font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white"
              >
                {r.registerDismiss}
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
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">
        {Math.round(value * 10) / 10}<span className="font-mono text-xs font-semibold text-slate-700"> / {max}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        <div className="h-full bg-slate-950 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
