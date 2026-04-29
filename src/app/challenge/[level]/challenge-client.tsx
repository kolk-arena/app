'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { CodeBlock } from '@/components/ui/code-block';
import { CopyButton } from '@/components/ui/copy-button';
import { QuickActionButton } from '@/components/ui/quick-action-button';
import {
  useLocalizedDateTimeFormatter,
  useLocalizedTimeFormatter,
  useServerNow,
} from '@/components/time/localized-time';
import { copy } from '@/i18n';
import {
  formatClockSeconds,
  formatNumber,
} from '@/i18n/format';
import type { BetaPublicLevel, ErrorCode, ScriptLang } from '@/i18n/types';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import {
  buildChallengeAgentBrief,
  CHALLENGE_SCRIPT_LANGS,
  extractStructuredBrief,
  getChallengeHandoffBundle,
  getChallengeScriptBundle,
  getCliTaskBundle,
  getEditorTaskBundle,
  getChallengeAgentContract,
  getCompletionContract,
  getScriptCodeLanguage,
  getLevelDeliveryInstruction,
  getLevelOutputTemplate,
  getN8nStarterBundle,
  getStructuredBriefCopy,
  getSubmitContractSnippet,
  getAgentRules,
  dryRunValidation,
} from '@/lib/frontend/agent-handoff';
import { serializeJsonForInlineScript } from '@/lib/frontend/inline-json';
import { MAX_PRIMARY_TEXT_CHARS } from '@/lib/kolk/constants';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
  SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
} from '@/lib/kolk/beta-contract';

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
  agentContext?: Record<string, unknown>;
  serverNowUtc?: string;
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
  fieldScores?: {
    field: string;
    score: number;
    reason: string;
    extractedNumbers?: { token: string; value: number; source: 'currency' | 'json_field' }[];
  }[];
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

const REFETCH_REQUIRED_ERROR_CODES = new Set(['INVALID_ATTEMPT_TOKEN', 'CHALLENGE_NOT_FOUND']);

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

function formatDeadlineRemaining(total: number): string {
  const seconds = Math.max(0, total);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function bandColor(band: SubmitResponse['colorBand']): string {
  switch (band) {
    case 'RED': return 'border border-rose-200 bg-rose-50 text-rose-800';
    case 'ORANGE': return 'border border-orange-200 bg-orange-50 text-orange-800';
    case 'YELLOW': return 'border border-amber-200 bg-amber-50 text-amber-800';
    case 'GREEN': return 'border border-emerald-200 bg-emerald-50 text-emerald-800';
    case 'BLUE': return 'border border-sky-200 bg-sky-50 text-sky-800';
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
  const [registerPromptOpen, setRegisterPromptOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [scriptTab, setScriptTab] = useState<ScriptLang>('curl');
  const [openDetailIdx, setOpenDetailIdx] = useState<number | null>(null);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{valid: boolean; errors: string[]; warnings: string[]} | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'failed'>('idle');
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const idempotencyKeyRef = useRef<string>('');
  const submitBodySignatureRef = useRef<string>('');
  const submitFormRef = useRef<HTMLFormElement | null>(null);
  const submitTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scriptTabRefs = useRef<Record<ScriptLang, HTMLButtonElement | null>>({
    curl: null,
    python: null,
    node: null,
  });
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: `challenge-layout-l${level}`,
    panelIds: ['challenge-brief-pane', 'challenge-console-pane'],
    storage: panelLayoutStorage,
  });
  const formatLocalDateTime = useLocalizedDateTimeFormatter();

  const handleDryRun = useCallback(() => {
    const result = dryRunValidation(level, primaryText);
    setDryRunResult(result);
    return result;
  }, [level, primaryText]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(max-width: 1279px)');
    const update = () => setIsCompactLayout(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  useEffect(() => {
    setHasNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

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
    setShareStatus('idle');
    setIsTextareaFocused(false);
    idempotencyKeyRef.current = randomIdempotencyKey();
    submitBodySignatureRef.current = '';
    setRefreshNonce((current) => current + 1);
  }, [level]);

  const scrollElementIntoView = useCallback((element: HTMLElement | null, focusTextarea = false) => {
    if (!element) return;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: isCompactLayout ? 'center' : 'start',
    });

    if (focusTextarea) {
      window.setTimeout(() => submitTextareaRef.current?.focus(), 120);
    }
  }, [isCompactLayout]);

  const scrollToSubmitCard = useCallback(() => {
    scrollElementIntoView(submitFormRef.current, true);
  }, [scrollElementIntoView]);

  const retrySameAttempt = useCallback(() => {
    setSubmitStatus({ kind: 'idle' });
    setDryRunResult(null);
    idempotencyKeyRef.current = randomIdempotencyKey();
    window.setTimeout(() => scrollToSubmitCard(), 0);
  }, [scrollToSubmitCard]);

  const scrollToSection = useCallback((id: string) => {
    scrollElementIntoView(document.getElementById(id));
  }, [scrollElementIntoView]);

  const handleScriptTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = CHALLENGE_SCRIPT_LANGS.indexOf(scriptTab);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % CHALLENGE_SCRIPT_LANGS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + CHALLENGE_SCRIPT_LANGS.length) % CHALLENGE_SCRIPT_LANGS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = CHALLENGE_SCRIPT_LANGS.length - 1;

    if (nextIndex == null) return;
    event.preventDefault();
    const nextLang = CHALLENGE_SCRIPT_LANGS[nextIndex];
    setScriptTab(nextLang);
    scriptTabRefs.current[nextLang]?.focus();
  }, [scriptTab]);

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
          submitBodySignatureRef.current = '';
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

  const now = useServerNow(
    fetchState.kind === 'ready'
      ? (fetchState.data.serverNowUtc ?? fetchState.data.challenge.challengeStartedAt)
      : undefined,
  );

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

      const submitBody = JSON.stringify({
        attemptToken: fetchState.data.challenge.attemptToken,
        primaryText,
      });

      if (!idempotencyKeyRef.current || submitBodySignatureRef.current !== submitBody) {
        idempotencyKeyRef.current = randomIdempotencyKey();
        submitBodySignatureRef.current = submitBody;
      }

      try {
        const resp = await fetch('/api/challenge/submit', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKeyRef.current,
          },
          body: submitBody,
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

        if (resp.status === 404 && code && REFETCH_REQUIRED_ERROR_CODES.has(code)) {
          idempotencyKeyRef.current = randomIdempotencyKey();
          setSubmitStatus({ kind: 'error', message, code });
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
          idempotencyKeyRef.current = randomIdempotencyKey();
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
          idempotencyKeyRef.current = randomIdempotencyKey();
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
          idempotencyKeyRef.current = randomIdempotencyKey();
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
  const agentContract = getChallengeAgentContract(handoffLevel);
  const completionContract = getCompletionContract();
  const structuredBriefCopy = getStructuredBriefCopy(challenge.taskJson);
  const submitContractSnippet = getSubmitContractSnippet(challenge.attemptToken, handoffLevel);
  const handoffBundle = getChallengeHandoffBundle({
    level: handoffLevel,
    levelName: level_info.name,
    promptMd: challenge.promptMd,
    taskJson: challenge.taskJson,
    attemptToken: challenge.attemptToken,
  });
  const cliTask = getCliTaskBundle({
    level: handoffLevel,
    levelName: level_info.name,
  });
  const n8nStarterBundle = getN8nStarterBundle({
    level: handoffLevel,
    levelName: level_info.name,
    promptMd: challenge.promptMd,
    taskJson: challenge.taskJson,
    attemptToken: challenge.attemptToken,
  });
  const editorTaskBundle = getEditorTaskBundle({
    level: handoffLevel,
    levelName: level_info.name,
    promptMd: challenge.promptMd,
    taskJson: challenge.taskJson,
    attemptToken: challenge.attemptToken,
  });
  const activeScriptLang = scriptTab;
  const scriptBundle = getChallengeScriptBundle(activeScriptLang, handoffLevel);
  const secondaryActionButtonClass = [
    'inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors duration-150 sm:w-auto',
    'hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-gentle disabled:pointer-events-none disabled:opacity-50',
  ].join(' ');
  const compactActionButtonClass = [
    'inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-950 transition-colors duration-150',
    'hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-gentle disabled:pointer-events-none disabled:opacity-50',
  ].join(' ');
  const primaryActionButtonClass = [
    'memory-accent-button inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors duration-150 sm:w-auto',
    'focus-visible:outline-none focus-gentle disabled:pointer-events-none disabled:opacity-50',
  ].join(' ');
  const scriptTabButtonClass = (lang: ScriptLang) =>
    `${compactActionButtonClass} ${scriptTab === lang ? 'bg-slate-950 text-white' : 'bg-white text-slate-950 hover:bg-slate-100'}`;

  const deliveryRule = getLevelDeliveryInstruction(handoffLevel);
  const authRequiredLevel = level > ANONYMOUS_BETA_MAX_LEVEL;
  const identityMode = authRequiredLevel ? 'signed_in_browser_session' : 'browser_session_cookie';

  const deliveryPlaceholder =
    level === 0
      ? copy.challenge.deliveryRules.placeholderLevel0
      : level === 5
      ? copy.challenge.deliveryRules.placeholderLevel5
      : copy.challenge.deliveryRules.placeholderDefault;
  const hasDraftText = primaryText.trim().length > 0;
  const submitFormIdBase = `challenge-submit-form-l${level}`;
  const activeSurface = isCompactLayout ? 'mobile' : 'desktop';
  const activeSubmitFormId = `${submitFormIdBase}-${activeSurface}`;
  const deliveryInputInvalid =
    (level === 5 && l5LocalValidation?.ok === false) ||
    Boolean(dryRunResult && !dryRunResult.valid);
  const sharePrimaryLabel =
    shareStatus === 'shared'
      ? hasNativeShare
        ? copy.challenge.agentPanel.sharedToAi
        : copy.challenge.agentPanel.copiedChallengeUrl
      : shareStatus === 'failed'
      ? hasNativeShare
        ? copy.challenge.agentPanel.shareToAiFailed
        : copy.challenge.agentPanel.copyFailed
      : hasNativeShare
      ? copy.challenge.agentPanel.shareToAi
      : copy.challenge.agentPanel.copyChallengeUrl;
  const challengeUrlShareText = [
    `Kolk Level ${level} — ${level_info.name}`,
    `Challenge URL: ${challengePageUrl}`,
    '',
    'Give this challenge URL to your browser agent. The page owns the browser session and exposes #kolk-challenge-state.',
    'Ask the agent to submit from this same page when possible. If it only returns primaryText, submit it here before treating the run as complete.',
  ].join('\n');
  const browserSubmitHeaders = authRequiredLevel
    ? {
        'Content-Type': 'application/json',
        'Idempotency-Key': '<uuid>',
        Cookie: '<same signed-in browser session cookie; browser page only>',
      }
    : {
        'Content-Type': 'application/json',
        'Idempotency-Key': '<uuid>',
        Cookie: '<same anonymous browser session cookie>',
      };
  const apiSubmitHeaders = authRequiredLevel
    ? {
        'Content-Type': 'application/json',
        'Idempotency-Key': '<uuid>',
        Authorization: 'Bearer <token>',
      }
    : {
        'Content-Type': 'application/json',
        'Idempotency-Key': '<uuid>',
        Cookie: '<same cookie jar used for fetch>',
      };
  const challengeRuntimeState = {
    schemaVersion: 'kolk-challenge-state.v1',
    pageType: 'challenge',
    canonicalOrigin: APP_CONFIG.canonicalOrigin,
    challengeUrl: challengePageUrl,
    apiUrl: `${APP_CONFIG.canonicalOrigin}/api/challenge/${level}`,
    level,
    levelName: level_info.name,
    identityMode,
    apiIdentityMode: authRequiredLevel ? 'bearer_token' : 'anonymous_cookie',
    sameIdentityRequired: true,
    sameSessionRequired: true,
    sourceOfTruth: {
      promptMd: challenge.promptMd,
      taskJson: challenge.taskJson,
      structuredBrief: structuredBrief ?? null,
      agentContext: fetchState.data.agentContext ?? null,
    },
    attempt: {
      attemptToken: challenge.attemptToken,
      sensitive: true,
      sensitiveReason: authRequiredLevel
        ? 'Bound to the signed-in identity that fetched this challenge. Browser agents should submit from this page; external API/workflow clients need the same bearer identity.'
        : 'Bound to the anonymous session cookie that fetched this challenge; submit from the same browser session or cookie jar.',
      ttlHours: challenge.timeLimitMinutes / 60,
      deadlineUtc: challenge.deadlineUtc,
      challengeStartedAt: challenge.challengeStartedAt,
      challengeId: challenge.challengeId,
      seed: challenge.seed ?? null,
      variant: challenge.variant ?? null,
    },
    output: {
      field: 'primaryText',
      type: 'string',
      ruleSummary: deliveryRule,
      template: outputTemplate,
      maxChars: MAX_PRIMARY_TEXT_CHARS,
      agentContract,
      effectiveOutputSchema:
        fetchState.data.agentContext && typeof fetchState.data.agentContext === 'object'
          ? (fetchState.data.agentContext as Record<string, unknown>).effectiveOutputSchema ?? null
          : null,
    },
    completionContract,
    effectiveContract: {
      effectiveBrief:
        fetchState.data.agentContext && typeof fetchState.data.agentContext === 'object'
          ? (fetchState.data.agentContext as Record<string, unknown>).effectiveBrief ?? null
          : null,
      effectiveChecks:
        fetchState.data.agentContext && typeof fetchState.data.agentContext === 'object'
          ? (fetchState.data.agentContext as Record<string, unknown>).effectiveChecks ?? null
          : null,
    },
    submit: {
      method: 'POST',
      url: `${APP_CONFIG.canonicalOrigin}/api/challenge/submit`,
      headers: browserSubmitHeaders,
      apiHeaders: apiSubmitHeaders,
      browserSessionNote: authRequiredLevel
        ? 'The page can submit with the signed-in HttpOnly browser session cookie. Do not try to export that cookie for workflow automation.'
        : 'Anonymous browser submit must keep the same HttpOnly session cookie that fetched this challenge.',
      externalAutomationNote: authRequiredLevel
        ? 'Workflow/API clients for L6+ should fetch and submit with Authorization: Bearer <token>, not an attemptToken alone or a copied browser token fingerprint.'
        : 'Workflow/API clients for anonymous L0-L5 must preserve the cookie jar from fetch through submit.',
      body: {
        attemptToken: '<from attempt.attemptToken>',
        primaryText: '<final delivery text only>',
      },
      schema: {
        attemptToken: 'string',
        primaryText: 'string',
        repoUrl: 'optional string',
        commitHash: 'optional string',
      },
      primaryTextMaxChars: MAX_PRIMARY_TEXT_CHARS,
    },
    selectors: {
      state: 'script#kolk-challenge-state[type="application/vnd.kolk.challenge+json"]',
      activeSurface: '[data-kolk-surface="active"]',
      brief: '[data-kolk-surface="active"] [data-kolk-section="brief"]',
      structuredBrief: '[data-kolk-surface="active"] [data-kolk-section="structured-brief"]',
      primaryText: '[data-kolk-surface="active"] textarea[name="primaryText"][data-kolk-field="primaryText"]',
      dryRun: '[data-kolk-surface="active"] [data-kolk-action="dry-run"]',
      submit: '[data-kolk-surface="active"] [data-kolk-action="submit"]',
      refetch: '[data-kolk-surface="active"] [data-kolk-action="refetch"]',
      retrySameAttempt: '[data-kolk-action="retry-same-attempt"]',
      submitResult: 'script#kolk-submit-result[type="application/vnd.kolk.submit-result+json"]',
      result: '[data-kolk-section="result"]',
      error: '[data-kolk-surface="active"] [data-kolk-section="submit-error"]',
    },
    retryPolicy: {
      sameAttemptToken: [
        'VALIDATION_ERROR',
        'TEXT_TOO_LONG',
        'INVALID_JSON',
        'L5_INVALID_JSON',
        'DUPLICATE_REQUEST',
        'RATE_LIMIT_MINUTE',
        'RATE_LIMIT_HOUR',
        'RATE_LIMIT_DAY',
        'ACCOUNT_FROZEN',
        'SCORING_UNAVAILABLE',
        'unlocked_false',
      ],
      refetch: [
        'INVALID_ATTEMPT_TOKEN',
        'CHALLENGE_NOT_FOUND',
        'ATTEMPT_TOKEN_EXPIRED',
        'ATTEMPT_ALREADY_PASSED',
        'RETRY_LIMIT_EXCEEDED',
      ],
      freshIdempotencyKeyForChangedPrimaryText: true,
      reuseIdempotencyKeyOnlyForExactOutcomeUnknownRetry: true,
      doNotRefetchAfterUnlockedFalse: true,
      honorRetryAfter: true,
      maxSubmitsPerAttemptToken: SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
      perAttemptMinuteLimit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
      perAttemptHourLimit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
      perIdentityDayLimit: SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
    },
  };
  const challengeRuntimeStateScript = (
    <script
      id="kolk-challenge-state"
      type="application/vnd.kolk.challenge+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonForInlineScript(challengeRuntimeState) }}
    />
  );

  async function handleShareToAi() {
    const sharePayload = {
      title: `${APP_CONFIG.name} · L${level}`,
      text: challengeUrlShareText,
      url: challengePageUrl,
    };

    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare(sharePayload))
      ) {
        await navigator.share(sharePayload);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(challengePageUrl);
      } else {
        throw new Error('share_unavailable');
      }

      setShareStatus('shared');
      window.setTimeout(() => setShareStatus('idle'), 2000);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(challengePageUrl);
          setShareStatus('shared');
          window.setTimeout(() => setShareStatus('idle'), 2000);
          return;
        }
      } catch {
        // Fall through to failure state.
      }
      setShareStatus('failed');
      window.setTimeout(() => setShareStatus('idle'), 2000);
    }
  }

  const renderChallengeUrlAction = (className: string) =>
    hasNativeShare ? (
      <button
        type="button"
        onClick={handleShareToAi}
        className={className}
      >
        {sharePrimaryLabel}
      </button>
    ) : (
      <CopyButton
        value={challengePageUrl}
        idleLabel={copy.challenge.agentPanel.copyChallengeUrl}
        copiedLabel={copy.challenge.agentPanel.copiedChallengeUrl}
        failedLabel={copy.challenge.agentPanel.copyFailed}
        className={className}
      />
    );

  function handleMobilePrimaryAction() {
    if (hasDraftText) {
      submitFormRef.current?.requestSubmit();
      return;
    }

    scrollToSubmitCard();
  }

  const timerCards = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500">{copy.challenge.cards.suggestedTime}</p>
        <p className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-950">
          {suggestedRemaining ? formatSeconds(suggestedRemaining.remainingSeconds) : '—'}
        </p>
        <p className={`mt-1 text-xs ${suggestedRemaining?.isOver ? 'text-amber-800' : 'text-slate-600'}`}>
          {suggestedRemaining?.isOver
            ? copy.challenge.time.suggestedPastDue
            : copy.challenge.time.suggestedBadge(challenge.suggestedTimeMinutes ?? level_info.suggested_time_minutes)}
        </p>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-500">{copy.challenge.cards.sessionDeadline}</p>
        <p className="mt-2 font-mono tabular-nums text-2xl font-semibold text-slate-950">
          {deadlineRemaining != null ? formatDeadlineRemaining(deadlineRemaining) : '—'}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {challenge.deadlineUtc
            ? copy.challenge.time.expiresAt(
                formatLocalDateTime(challenge.deadlineUtc),
              )
            : ''}
        </p>
      </div>
    </div>
  );

  const briefCard = (
    <div id="mobile-brief-anchor" data-kolk-section="brief" className="scroll-mt-28">
      <CodeBlock
        eyebrow={copy.challenge.cards.brief}
        code={challenge.promptMd}
        language="markdown"
        copyValue={challenge.promptMd}
        copyLabel={copy.challenge.agentPanel.copyBriefText}
        copiedLabel={copy.challenge.agentPanel.copiedBriefText}
        failedLabel={copy.challenge.agentPanel.copyFailed}
        tone="light"
      />
    </div>
  );

  const handoffCard = (
    <article id="mobile-agent-anchor" className="min-w-0 scroll-mt-28 rounded-md border border-slate-200 bg-white p-6 sm:p-8">
      <p className="text-xs font-medium text-slate-500">
        {copy.challenge.agentPanel.eyebrow}
      </p>
      <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
        {copy.challenge.agentPanel.title}
      </h2>
      <p className="mt-2 text-sm leading-7 text-slate-700">
        {copy.challenge.agentPanel.body}
      </p>
      {isCompactLayout ? (
        <details className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-900">
            {copy.challenge.agentPanel.mobileGuidanceSummary}
          </summary>
          <div className="mt-3 space-y-3">
            <ol className="space-y-2 text-sm leading-6 text-slate-800">
              {copy.challenge.agentPanel.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs leading-6 text-slate-600">
              {copy.challenge.agentPanel.browserModeNote}
            </p>
          </div>
        </details>
      ) : (
        <>
          <ol className="mt-4 space-y-2 text-sm leading-6 text-slate-800">
            {copy.challenge.agentPanel.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-medium text-slate-700">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-6 text-slate-600">
            {copy.challenge.agentPanel.browserModeNote}
          </p>
        </>
      )}

      <section className="mt-6 rounded-md bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-500">
          {copy.challenge.agentPanel.directActionsEyebrow}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {copy.challenge.agentPanel.directActionsBody}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {renderChallengeUrlAction(hasDraftText ? secondaryActionButtonClass : primaryActionButtonClass)}
          <CopyButton
            value={agentBrief}
            idleLabel={copy.challenge.agentPanel.copyAgentBrief}
            copiedLabel={copy.challenge.agentPanel.copiedAgentBrief}
            failedLabel={copy.challenge.agentPanel.copyFailed}
            className={secondaryActionButtonClass}
          />
          <button
            data-kolk-action="refetch"
            type="button"
            onClick={requestFreshChallenge}
            className={secondaryActionButtonClass}
          >
            {copy.challenge.deliveryRules.refetch}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-6 text-slate-600">
          <a
            href="/kolk_arena.md"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors duration-150 hover:text-slate-950 hover:decoration-slate-500"
            aria-label={copy.homeInteractive.openSkill}
          >
            {copy.homeInteractive.openSkill}
          </a>
        </div>
      </section>
    </article>
  );

  const getMobileDetailProps = (index: number) =>
    isCompactLayout
      ? {
          open: openDetailIdx === index,
          onClick: (e: React.MouseEvent<HTMLElement>) => {
            const target = e.target as HTMLElement;
            if (target.tagName.toLowerCase() === 'summary' || target.closest('summary')) {
              e.preventDefault();
              setOpenDetailIdx(openDetailIdx === index ? null : index);
            }
          },
        }
      : {};

  const renderAdvancedToolsCard = (surface: 'mobile' | 'desktop') => {
    const scriptTabPanelId = `challenge-script-panel-l${level}-${surface}`;

    return (
    <section id={surface === 'mobile' ? 'mobile-tools-anchor' : undefined} className="scroll-mt-28 space-y-4">
      <details data-kolk-section="structured-brief" className="rounded-md border border-slate-200 bg-white" {...getMobileDetailProps(0)}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
          {structuredBrief ? copy.challenge.agentPanel.structuredBriefTitle : copy.challenge.agentPanel.taskJsonTitle}
        </summary>
        <div className="px-4 pb-4 pt-2">
          <p className="text-sm leading-6 text-slate-700">
            {copy.challenge.agentPanel.challengeBriefBody}
          </p>
          <CodeBlock
            code={structuredBriefCopy}
            language="json"
            tone="dark"
            mobileChrome="subtle"
            copyValue={structuredBriefCopy}
            copyLabel={structuredBrief ? copy.challenge.agentPanel.copyStructuredBrief : copy.challenge.agentPanel.copyTaskJson}
            copiedLabel={structuredBrief ? copy.challenge.agentPanel.copiedStructuredBrief : copy.challenge.agentPanel.copiedTaskJson}
            failedLabel={copy.challenge.agentPanel.copyFailed}
            className="mt-3"
          />
        </div>
      </details>

      <details className="rounded-md border border-slate-200 bg-white" {...getMobileDetailProps(1)}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
          {copy.challenge.agentPanel.supportAssetsEyebrow}
        </summary>
        <div className="px-4 pb-4 pt-2">
          <p className="text-sm leading-6 text-slate-700">
            {copy.challenge.agentPanel.supportAssetsBody}
          </p>
          {isCompactLayout ? (
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => downloadFile(`kolk-l${level}-handoff.json`, handoffBundle)}
                className={secondaryActionButtonClass}
              >
                {copy.challenge.agentPanel.downloadHandoffBundle}
              </button>
              <details className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-900">
                  {copy.challenge.agentPanel.moreAssetsSummary}
                </summary>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => downloadFile(`kolk-l${level}-cli-task.md`, cliTask)}
                    className={secondaryActionButtonClass}
                  >
                    {copy.challenge.agentPanel.downloadCliTask}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFile(`kolk-l${level}-n8n-starter.json`, n8nStarterBundle)}
                    className={secondaryActionButtonClass}
                  >
                    {copy.challenge.agentPanel.downloadN8nStarter}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFile(`kolk-l${level}-editor-task.md`, editorTaskBundle)}
                    className={secondaryActionButtonClass}
                  >
                    {copy.challenge.agentPanel.downloadEditorTask}
                  </button>
                  <CopyButton
                    value={submitContractSnippet}
                    idleLabel={copy.challenge.agentPanel.copySubmitContract}
                    copiedLabel={copy.challenge.agentPanel.copiedSubmitContract}
                    failedLabel={copy.challenge.agentPanel.copyFailed}
                    className={secondaryActionButtonClass}
                  />
                  <CopyButton
                    value={outputTemplate}
                    idleLabel={copy.challenge.agentPanel.copyOutputTemplate}
                    copiedLabel={copy.challenge.agentPanel.copiedOutputTemplate}
                    failedLabel={copy.challenge.agentPanel.copyFailed}
                    className={secondaryActionButtonClass}
                  />
                  <button
                    data-kolk-action="refetch"
                    type="button"
                    onClick={requestFreshChallenge}
                    className={secondaryActionButtonClass}
                  >
                    {copy.challenge.deliveryRules.refetch}
                  </button>
                </div>
              </details>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => downloadFile(`kolk-l${level}-handoff.json`, handoffBundle)}
                className={secondaryActionButtonClass}
              >
                {copy.challenge.agentPanel.downloadHandoffBundle}
              </button>
              <button
                type="button"
                onClick={() => downloadFile(`kolk-l${level}-cli-task.md`, cliTask)}
                className={secondaryActionButtonClass}
              >
                {copy.challenge.agentPanel.downloadCliTask}
              </button>
              <button
                type="button"
                onClick={() => downloadFile(`kolk-l${level}-n8n-starter.json`, n8nStarterBundle)}
                className={secondaryActionButtonClass}
              >
                {copy.challenge.agentPanel.downloadN8nStarter}
              </button>
              <button
                type="button"
                onClick={() => downloadFile(`kolk-l${level}-editor-task.md`, editorTaskBundle)}
                className={secondaryActionButtonClass}
              >
                {copy.challenge.agentPanel.downloadEditorTask}
              </button>
              <CopyButton
                value={submitContractSnippet}
                idleLabel={copy.challenge.agentPanel.copySubmitContract}
                copiedLabel={copy.challenge.agentPanel.copiedSubmitContract}
                failedLabel={copy.challenge.agentPanel.copyFailed}
                className={secondaryActionButtonClass}
              />
              <CopyButton
                value={outputTemplate}
                idleLabel={copy.challenge.agentPanel.copyOutputTemplate}
                copiedLabel={copy.challenge.agentPanel.copiedOutputTemplate}
                failedLabel={copy.challenge.agentPanel.copyFailed}
                className={secondaryActionButtonClass}
              />
              <button
                data-kolk-action="refetch"
                type="button"
                onClick={requestFreshChallenge}
                className={secondaryActionButtonClass}
              >
                {copy.challenge.deliveryRules.refetch}
              </button>
            </div>
          )}
        </div>
      </details>

      <details className="overflow-hidden rounded-md border border-slate-200 bg-white" {...getMobileDetailProps(2)}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-900">
          {copy.challenge.agentPanel.scriptToolkitEyebrow}
        </summary>
        <div className="px-4 pb-4 pt-2">
          <p className="text-sm leading-6 text-slate-700">
            {copy.challenge.agentPanel.scriptToolkitBody}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CopyButton
              value={scriptBundle.code}
              idleLabel={copy.challenge.agentPanel.copyScriptButton(activeScriptLang)}
              copiedLabel={copy.challenge.agentPanel.copiedScriptButton}
              failedLabel={copy.challenge.agentPanel.copyScriptFailed}
              className={compactActionButtonClass}
            />
            <button
              type="button"
              onClick={() => downloadFile(scriptBundle.filename, scriptBundle.code)}
              className={compactActionButtonClass}
            >
              {copy.challenge.agentPanel.downloadScriptButton}
            </button>
            <button
              type="button"
              onClick={() => downloadFile(copy.challenge.agentPanel.agentRulesFilename, getAgentRules())}
              className={compactActionButtonClass}
            >
              {copy.challenge.agentPanel.downloadAgentRules}
            </button>
          </div>
        </div>
        <div className="bg-slate-50 px-4 py-3">
          <div
            role="tablist"
            aria-label={copy.challenge.agentPanel.scriptTabListAriaLabel}
            className="flex flex-wrap gap-2"
          >
            {CHALLENGE_SCRIPT_LANGS.map((lang) => (
              <button
                key={lang}
                ref={(node) => {
                  scriptTabRefs.current[lang] = node;
                }}
                type="button"
                role="tab"
                id={`challenge-script-tab-${surface}-${lang}`}
                aria-controls={scriptTabPanelId}
                aria-selected={scriptTab === lang}
                tabIndex={scriptTab === lang ? 0 : -1}
                onClick={() => setScriptTab(lang)}
                onKeyDown={handleScriptTabKeyDown}
                className={scriptTabButtonClass(lang)}
              >
                {copy.challenge.agentPanel.scriptTabs[lang]}
              </button>
            ))}
          </div>
        </div>
        <div id={scriptTabPanelId} role="tabpanel" aria-labelledby={`challenge-script-tab-${surface}-${scriptTab}`} className="min-w-0 space-y-4 p-4">
          {scriptBundle.steps.map((step, index) => (
            <CodeBlock
              key={`${scriptTab}-${step.title}`}
              title={`#${index + 1} · ${step.title}`}
              code={step.code}
              language={getScriptCodeLanguage(activeScriptLang)}
              mobileChrome="subtle"
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
    </section>
    );
  };

  const renderSubmitCard = (surface: 'mobile' | 'desktop') => {
    const isActiveSurface = activeSurface === surface;
    const submitFormId = `${submitFormIdBase}-${surface}`;
    const submitButtonId = `challenge-submit-button-l${level}-${surface}`;
    const deliveryInputId = `challenge-delivery-input-l${level}-${surface}`;
    const deliveryHintId = `challenge-delivery-hint-l${level}-${surface}`;
    const deliveryCountId = `challenge-delivery-count-l${level}-${surface}`;
    const l5ValidationId = `challenge-l5-validation-l${level}-${surface}`;
    const dryRunErrorsId = `challenge-dry-run-errors-l${level}-${surface}`;
    const dryRunWarningsId = `challenge-dry-run-warnings-l${level}-${surface}`;
    const dryRunPassedId = `challenge-dry-run-passed-l${level}-${surface}`;
    const deliveryInputDescribedBy = [
      deliveryHintId,
      deliveryCountId,
      level === 5 && l5LocalValidation !== null ? l5ValidationId : null,
      dryRunResult && !dryRunResult.valid ? dryRunErrorsId : null,
      dryRunResult?.warnings.length ? dryRunWarningsId : null,
      dryRunResult && dryRunResult.valid && dryRunResult.warnings.length === 0 ? dryRunPassedId : null,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <form
        id={submitFormId}
        ref={isActiveSurface ? submitFormRef : null}
        data-kolk-form={isActiveSurface ? 'submit' : undefined}
        onSubmit={handleSubmit}
        aria-busy={submitStatus.kind === 'submitting'}
        className="scroll-mt-28 space-y-4 rounded-md border border-slate-200 bg-white p-6 sm:p-8"
      >
        <SubmitErrorBanner status={submitStatus} level={level} onRefetch={requestFreshChallenge} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <label htmlFor={deliveryInputId} className="text-xs font-medium text-slate-500">
              {copy.challenge.cards.yourDelivery}
            </label>
            <p id={deliveryHintId} className="mt-1 text-sm font-medium text-slate-900">
              {deliveryRule}
            </p>
          </div>
          <span id={deliveryCountId} className="text-xs font-medium text-slate-600">
            {copy.challenge.deliveryRules.chars(formatNumber(primaryText.length))}
          </span>
        </div>

        <textarea
          id={deliveryInputId}
          name="primaryText"
          data-kolk-field={isActiveSurface ? 'primaryText' : undefined}
          ref={isActiveSurface ? submitTextareaRef : null}
          value={primaryText}
          onChange={(e) => setPrimaryText(e.target.value)}
          onFocus={() => setIsTextareaFocused(true)}
          onBlur={() => setIsTextareaFocused(false)}
          rows={level === 5 ? 12 : 14}
          spellCheck={level !== 5}
          aria-describedby={deliveryInputDescribedBy}
          aria-invalid={deliveryInputInvalid}
          // Matches the server cap in `src/lib/kolk/constants/index.ts`. The
          // submit route still hard-enforces via HTTP 422 TEXT_TOO_LONG, but
          // stopping over-long pastes at the input saves the round-trip and
          // makes the failure mode legible to the user.
          maxLength={MAX_PRIMARY_TEXT_CHARS}
          className="w-full rounded-md border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-950 outline-none transition focus:ring-2 focus:ring-slate-950"
          placeholder={deliveryPlaceholder}
        />

        {level === 5 && l5LocalValidation && !l5LocalValidation.ok ? (
          <p
            id={l5ValidationId}
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900"
          >
            {copy.challenge.deliveryRules.localJsonInvalid(l5LocalValidation.message)}
          </p>
        ) : null}
        {level === 5 && l5LocalValidation && l5LocalValidation.ok ? (
          <p
            id={l5ValidationId}
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800"
          >
            {copy.challenge.deliveryRules.localJsonValid}
          </p>
        ) : null}

        {dryRunResult && !dryRunResult.valid && (
          <div
            id={dryRunErrorsId}
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900"
          >
            <p className="font-semibold">{copy.challenge.dryRun.failedHeading}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {dryRunResult.errors.map(err => <li key={err}>{err}</li>)}
            </ul>
          </div>
        )}
        {dryRunResult?.warnings.length ? (
          <div
            id={dryRunWarningsId}
            role="status"
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-900"
          >
            <p className="font-semibold">{copy.challenge.dryRun.warningHeading}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {dryRunResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        ) : null}
        {dryRunResult && dryRunResult.valid && dryRunResult.warnings.length === 0 && (
          <p
            id={dryRunPassedId}
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800"
          >
            {copy.challenge.dryRun.passedMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            data-kolk-action={isActiveSurface ? 'dry-run' : undefined}
            type="button"
            onClick={handleDryRun}
            className={secondaryActionButtonClass}
          >
            {copy.challenge.dryRun.validateButton}
          </button>
          <button
            id={submitButtonId}
            data-kolk-action={isActiveSurface ? 'submit' : undefined}
            type="submit"
            disabled={submitStatus.kind === 'submitting' || primaryText.trim().length === 0}
            className="memory-accent-button inline-flex items-center rounded-md border px-6 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitStatus.kind === 'submitting' ? copy.challenge.deliveryRules.scoring : copy.challenge.deliveryRules.submit}
          </button>
        </div>
        <p className="text-xs leading-5 text-slate-600">
          {copy.challenge.cards.attemptTokenFingerprint}: <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-950">{challenge.attemptToken.slice(0, 12)}…</code>
          {' '}· {copy.challenge.cards.challengeId}: <code className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-950">{challenge.challengeId.slice(0, 8)}…</code>
        </p>
      </form>
    );
  };

  // Success overlay — render result card instead of the form
  if (submitStatus.kind === 'success') {
    return (
      <>
        {challengeRuntimeStateScript}
        <ResultCard
          result={submitStatus.result}
          levelName={level_info.name}
          registerPromptOpen={registerPromptOpen}
          onDismissRegisterPrompt={() => setRegisterPromptOpen(false)}
          onRetry={submitStatus.result.unlocked ? requestFreshChallenge : retrySameAttempt}
        />
      </>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {challengeRuntimeStateScript}
      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/play"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
            >
              {copy.challenge.header.backToPlay}
            </Link>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {copy.challenge.header.levelBand(level, level_info.band)}
            </span>
            {level_info.is_boss ? (
              <span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-800">
                {copy.challenge.header.bossLevel}
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{level_info.name}</h1>
          {boss_hint ? (
            <p className="text-sm leading-6 text-rose-800">{copy.challenge.header.advancedHint}</p>
          ) : null}
          {replay_warning ? (
            <p className="text-sm leading-6 text-amber-800">{replay_warning}</p>
          ) : null}
        </header>

        <div
          data-kolk-surface={isCompactLayout ? 'active' : 'inactive'}
          className="min-w-0 space-y-8 xl:hidden px-1"
        >
          {timerCards}
          {briefCard}
          {handoffCard}
          {renderSubmitCard('mobile')}
          {renderAdvancedToolsCard('mobile')}
        </div>

        <div data-kolk-surface={isCompactLayout ? 'inactive' : 'active'} className="hidden xl:block">
          <Group
            id={`challenge-layout-l${level}`}
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="min-h-[820px] rounded-md border border-slate-200 bg-white"
          >
            <Panel id="challenge-brief-pane" defaultSize={48} minSize={36}>
              <div className="h-full min-w-0 overflow-y-auto bg-white p-6 xl:p-8 space-y-6">
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
            <Panel id="challenge-console-pane" defaultSize={52} minSize={36}>
              <div className="h-full min-w-0 overflow-y-auto bg-slate-50 p-6 xl:p-8 space-y-6">
                {handoffCard}
                {renderSubmitCard('desktop')}
                {renderAdvancedToolsCard('desktop')}
              </div>
            </Panel>
          </Group>
        </div>
      </section>
      <div className="xl:hidden">
        {!isTextareaFocused ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row">
              {hasDraftText ? (
                <>
                  <button
                    data-kolk-action="submit"
                    type="button"
                    onClick={handleMobilePrimaryAction}
                    disabled={submitStatus.kind === 'submitting'}
                    aria-controls={activeSubmitFormId}
                    className="memory-accent-button inline-flex min-h-11 flex-1 items-center justify-center rounded-md border px-4 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitStatus.kind === 'submitting' ? copy.challenge.deliveryRules.scoring : copy.challenge.deliveryRules.submit}
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToSection('mobile-brief-anchor')}
                    className={`${secondaryActionButtonClass} flex-1 sm:w-auto`}
                  >
                    {copy.challenge.agentPanel.mobileNavBrief}
                  </button>
                </>
              ) : (
                <>
                  {renderChallengeUrlAction(`${primaryActionButtonClass} flex-1 sm:w-auto`)}
                  <button
                    type="button"
                    onClick={scrollToSubmitCard}
                    className={`${secondaryActionButtonClass} flex-1 sm:w-auto`}
                  >
                    {copy.challenge.agentPanel.jumpToEditor}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
        {!isTextareaFocused ? <div className="h-24 sm:h-20" aria-hidden="true" /> : null}
      </div>
    </main>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function LoadingShell({ level }: { level: number }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="h-8 w-56 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <div className="h-12 w-80 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
          <div className="h-24 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        </div>
        <div className="h-56 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <div className="h-40 animate-pulse rounded-md border border-slate-200 bg-slate-200" />
        <p className="text-xs text-slate-600">{copy.challenge.errorStates.fetchingChallenge(level)}</p>
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
    rose: 'border border-rose-200 bg-rose-50 text-rose-800',
    amber: 'border border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border border-slate-200 bg-slate-50 text-slate-800',
  };
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <div className={`rounded-xl p-8 shadow-sm ${accentMap[accent]}`}>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-3 text-sm leading-6">{message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {primary ? (
              primary.onClick ? (
                <QuickActionButton
                  type="button"
                  onClick={primary.onClick}
                  className="memory-accent-button"
                >
                  {primary.label}
                </QuickActionButton>
              ) : primary.href ? (
                <QuickActionButton
                  href={primary.href}
                  tone="sans"
                  className="memory-accent-button"
                >
                  {primary.label}
                </QuickActionButton>
              ) : null
            ) : null}
            {secondary ? (
              secondary.onClick ? (
                <QuickActionButton
                  type="button"
                  onClick={secondary.onClick}
                  variant="secondary"
                  tone="sans"
                  size="lg"
                  width="stack"
                >
                  {secondary.label}
                </QuickActionButton>
              ) : secondary.href ? (
                <QuickActionButton
                  href={secondary.href}
                  variant="secondary"
                  tone="sans"
                  size="lg"
                  width="stack"
                >
                  {secondary.label}
                </QuickActionButton>
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
    <span className="inline-flex items-center rounded-md border border-current bg-white px-2 py-0.5 font-mono text-[11px] tabular-nums font-semibold">
      {label} {used}/{max}
    </span>
  );
}

function submitStatusWireCode(status: SubmitStatus): string | undefined {
  switch (status.kind) {
    case 'validation_error':
      return status.isL5JsonError ? 'L5_INVALID_JSON' : 'VALIDATION_ERROR';
    case 'auth_required':
      return 'AUTH_REQUIRED';
    case 'identity_mismatch':
      return 'IDENTITY_MISMATCH';
    case 'session_expired':
      return 'ATTEMPT_TOKEN_EXPIRED';
    case 'session_already_submitted':
      return 'ATTEMPT_ALREADY_PASSED';
    case 'rate_limit_minute':
      return 'RATE_LIMIT_MINUTE';
    case 'rate_limit_hour':
      return 'RATE_LIMIT_HOUR';
    case 'rate_limit_day':
      return 'RATE_LIMIT_DAY';
    case 'retry_limit_exceeded':
      return 'RETRY_LIMIT_EXCEEDED';
    case 'account_frozen':
      return 'ACCOUNT_FROZEN';
    case 'scoring_unavailable':
      return 'SCORING_UNAVAILABLE';
    case 'error':
      return status.code;
    default:
      return undefined;
  }
}

function submitStatusRetryAfter(status: SubmitStatus): number | undefined {
  if (
    status.kind === 'rate_limit_minute'
    || status.kind === 'rate_limit_hour'
    || status.kind === 'rate_limit_day'
    || status.kind === 'account_frozen'
  ) {
    return status.retryAfterSeconds;
  }
  return undefined;
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
    || status.kind === 'auth_required'
    || status.kind === 'retry_limit_exceeded'
    || (status.kind === 'error' && status.code != null && REFETCH_REQUIRED_ERROR_CODES.has(status.code));

  const isCooldown =
    status.kind === 'rate_limit_minute'
    || status.kind === 'rate_limit_hour'
    || status.kind === 'rate_limit_day';

  const tone =
    status.kind === 'validation_error'
      ? 'border border-amber-200 bg-amber-50 text-amber-900'
      : isCooldown
      ? 'border border-orange-200 bg-orange-50 text-orange-900'
      : status.kind === 'retry_limit_exceeded'
      ? 'border border-rose-200 bg-rose-50 text-rose-900'
      : 'border border-rose-200 bg-rose-50 text-rose-900';

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
  const wireCode = submitStatusWireCode(status);
  const retryAfter = submitStatusRetryAfter(status);

  return (
    <div
      role="alert"
      data-kolk-section="submit-error"
      data-kolk-error-code={wireCode}
      data-kolk-retry-after={retryAfter}
      className={`rounded-xl px-5 py-4 shadow-sm ${tone}`}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{status.message}</p>

      {isL5Json ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs text-amber-900">
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
        <p className="mt-2 text-xs font-medium">
          {sb.retryAfter(status.retryAfterSeconds)}
          {status.kind === 'rate_limit_hour' ? sb.hourFreezeWarning : ''}
        </p>
      ) : null}

      {requiresRefetch ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            data-kolk-action="refetch"
            type="button"
            onClick={onRefetch}
            className="memory-accent-button inline-flex items-center rounded-md border px-4 py-2 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
          >
            {sb.fetchNewChallenge}
          </button>
          {status.kind === 'auth_required' || status.kind === 'identity_mismatch' ? (
            <Link
              href="/profile"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
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
  const initialRemaining = useMemo(
    () =>
      typeof status.retryAfterSeconds === 'number' && Number.isFinite(status.retryAfterSeconds)
        ? Math.max(0, Math.floor(status.retryAfterSeconds))
        : null,
    [status.retryAfterSeconds],
  );
  const [tick, setTick] = useState(0);
  const formatLocalTime = useLocalizedTimeFormatter();

  useEffect(() => {
    if (initialRemaining == null) return;
    const id = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [initialRemaining]);
  const remaining =
    initialRemaining == null
      ? null
      : Math.max(0, initialRemaining - tick);

  const localTime = status.frozenUntil
    ? formatLocalTime(status.frozenUntil)
    : null;

  const af = copy.challenge.accountFrozen;
  const sb = copy.challenge.submitBanner;
  return (
    <div
      role="alert"
      data-kolk-section="submit-error"
      data-kolk-error-code={submitStatusWireCode(status)}
      data-kolk-retry-after={submitStatusRetryAfter(status)}
      className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-8 text-rose-900 shadow-sm"
    >
      <p className="text-xl font-bold tracking-tight">{af.title}</p>
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
  const shareReceiptPath = result.level >= 1 ? `/share/submission/${result.submissionId}` : null;
  const shareReceiptUrl = shareReceiptPath ? `${APP_CONFIG.canonicalOrigin}${shareReceiptPath}` : null;
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
  const resultRuntimeState = {
    schemaVersion: 'kolk-submit-result.v1',
    level: result.level,
    submissionId: result.submissionId,
    unlocked,
    totalScore: result.totalScore,
    structureScore: result.structureScore ?? null,
    coverageScore: result.coverageScore ?? null,
    qualityScore: result.qualityScore ?? null,
    colorBand: result.colorBand,
    qualityLabel: result.qualityLabel,
    summary: result.summary,
    failReason: result.failReason ?? null,
    flags: result.flags,
    fieldScores: result.fieldScores ?? [],
    qualitySubscores: result.qualitySubscores ?? null,
    levelUnlocked: result.levelUnlocked ?? null,
    percentile: result.percentile ?? null,
    solveTimeSeconds: result.solveTimeSeconds ?? null,
    efficiencyBadge: result.efficiencyBadge ?? false,
    leaderboardEligible: result.leaderboardEligible ?? false,
    retry: unlocked
      ? {
          nextAction: 'fetch_fresh_challenge',
          attemptTokenReusable: false,
        }
      : {
          nextAction: 'revise_primaryText_same_attempt',
          attemptTokenReusable: true,
        },
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <script
        id="kolk-submit-result"
        type="application/vnd.kolk.submit-result+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForInlineScript(resultRuntimeState) }}
      />
      <section className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <header className="flex flex-wrap items-center gap-2">
          <Link
            href="/play"
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
          >
            {copy.challenge.header.backToPlay}
          </Link>
          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            {copy.challenge.header.resultLevelTitle(result.level, levelName)}
          </span>
        </header>

        <div
          data-kolk-section="result"
          data-kolk-level={result.level}
          data-kolk-submission-id={result.submissionId}
          data-kolk-unlocked={unlocked ? 'true' : 'false'}
          className="rounded-md border border-slate-200 bg-white p-6 sm:p-10"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">{r.eyebrow}</p>
              <p className="mt-1 text-5xl font-bold tracking-tight text-slate-950">{Math.round(result.totalScore)}<span className="font-mono text-lg font-semibold text-slate-700">{r.scoreOutOf(100)}</span></p>
              <p className="mt-2 text-sm font-medium text-slate-800">{result.summary}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {band ? (
                <span className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-medium ${bandColor(band)}`}>
                  {band}{result.qualityLabel ? ` · ${result.qualityLabel}` : ''}
                </span>
              ) : null}
              <span className={`inline-flex items-center rounded-md border px-3 py-1 text-xs font-medium ${unlocked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
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
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 sm:col-span-3">
                <p className="text-xs font-medium text-emerald-800">{r.onboardingEyebrow}</p>
                <p className="mt-2 text-sm font-medium text-emerald-950">{r.onboardingBody}</p>
              </div>
            )}
          </div>

          {hasPercentile && !isOnboarding ? (
            <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-900">
              {r.percentile(result.level, Math.round(result.percentile!))}
            </div>
          ) : null}

          {!unlocked && failReasonLabel ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
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
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
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
                <p className="text-xs font-medium text-slate-500">{r.fieldFeedbackHeading}</p>
              <ul className="mt-2 space-y-2">
                {(result.fieldScores ?? []).map((f) => (
                  <li key={f.field} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{f.field}</p>
                      <p className="font-mono text-xs font-semibold text-slate-800">{f.score}{r.pointsSuffix}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{f.reason}</p>
                    {f.extractedNumbers?.length ? (
                      <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-600">
                        {f.extractedNumbers.map((entry, index) => (
                          <li key={`${f.field}-${index}-${entry.token}`}>
                            {entry.source}: {entry.token} = {entry.value}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {unlocked && nextLevel ? (
              <Link
                href={`/challenge/${nextLevel}`}
                className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
              >
                {r.tryNextLevel(nextLevel)}
              </Link>
            ) : null}
            <button
              data-kolk-action={unlocked ? 'refetch' : 'retry-same-attempt'}
              type="button"
              onClick={onRetry}
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
            >
              {r.retryLevel(result.level)}
            </button>
            <Link
              href="/play"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
            >
              {r.backToPlay}
            </Link>
            <Link
              href="/leaderboard"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
            >
              {r.leaderboard}
            </Link>
            {shareReceiptPath && shareReceiptUrl ? (
              <>
                <Link
                  href={shareReceiptPath}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
                >
                  {r.shareResult}
                </Link>
                <CopyButton
                  value={shareReceiptUrl}
                  idleLabel={r.copyResultLink}
                  copiedLabel={r.copiedResultLink}
                  failedLabel={copy.common.copyFailed}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
                />
              </>
            ) : null}
          </div>
        </div>

        {result.replayUnlocked && result.nextSteps ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-medium text-emerald-800">{r.replayEyebrow}</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-emerald-950">{r.replayTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{result.nextSteps.replay}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={result.nextSteps.discord}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-800"
              >
                {r.joinDiscord}
              </a>
              <a
                href={result.nextSteps.share}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
              >
                {r.shareResult}
              </a>
            </div>
          </div>
        ) : null}

        {registerPromptOpen ? (
          <div role="dialog" aria-modal="true" className="rounded-md border border-emerald-200 bg-emerald-50 p-6">
            <p className="text-xs font-medium text-emerald-800">{r.registerEyebrow}</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-emerald-950">{r.registerTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{r.registerBody}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/profile"
                className="memory-accent-button inline-flex items-center rounded-md border px-5 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-memory)] focus-visible:ring-offset-2"
              >
                {r.registerCta}
              </Link>
              <button
                type="button"
                onClick={onDismissRegisterPrompt}
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950"
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
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-950">
        {Math.round(value * 10) / 10}<span className="font-mono text-xs font-semibold text-slate-700"> / {max}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        <div className="h-full bg-slate-950 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
