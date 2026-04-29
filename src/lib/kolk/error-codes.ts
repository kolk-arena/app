/**
 * Single source of truth for the public agent-automation error contract.
 *
 * Every code an external agent integrator can encounter on the documented
 * agent surfaces (challenge fetch / submit / session / sample-success /
 * docs / catalog) is enumerated here with its HTTP status, retry
 * disposition, default retry-after, and fix hint.
 *
 * Consumers:
 *   - `src/lib/kolk/agentic-url/automation-manifest.ts` derives the
 *     manifest's `retry.sameAttemptToken` and `retry.refetch` arrays plus
 *     the `errorCodes` enum from this registry.
 *   - `src/app/api/challenge/submit/route.ts` and the other route
 *     handlers emit codes from this registry and use `getErrorCode()` to
 *     pull canonical fix hints.
 *   - `tests/unit/error-codes-contract.test.mjs` asserts that every
 *     emitted code in the route handlers is registered, and that the
 *     manifest's retry arrays match this registry exactly.
 *
 * If you add a new code:
 *   1. Add the record below.
 *   2. Use `errorCode('YOUR_CODE')` in the route handler.
 *   3. The manifest and drift test pick it up automatically.
 */

/**
 * Retry disposition for an error code.
 *
 *   - `sameAttemptToken` — fixable client error or transient pressure;
 *     the same `attemptToken` stays valid, agents retry the submit
 *     after fixing the body or honoring `Retry-After`.
 *   - `refetch` — terminal for this token; agents must call
 *     `GET /api/challenge/:level` to obtain a new `attemptToken`.
 *   - `auth` — authentication / identity issue; agents must establish
 *     the correct identity (cookie or bearer token) before retrying
 *     from fetch.
 *   - `platform` — server-side condition (5xx); agents back off and
 *     retry later. Server-side failures auto-refund the rate-limit
 *     slot so quota is not consumed.
 *   - `terminal` — request is structurally invalid for this surface;
 *     no retry will help (e.g. requesting an unpublished level).
 */
export type ErrorCodeRetry =
  | 'sameAttemptToken'
  | 'refetch'
  | 'auth'
  | 'platform'
  | 'terminal';

/** Public agent surface that can emit a given code. */
export type ErrorCodeSurface =
  | 'fetch'
  | 'submit'
  | 'session'
  | 'sample'
  | 'docs';

export interface ErrorCodeRecord {
  /** Canonical code identifier sent in the response body's `code` field. */
  code: string;
  /** HTTP status the surface returns for this code. */
  http: number;
  /** Retry disposition; informs the manifest's retry arrays. */
  retry: ErrorCodeRetry;
  /**
   * Default `Retry-After` in seconds. `null` when no header is sent or the
   * value is computed at runtime from rate-limit windows.
   */
  retryAfterDefault: number | null;
  /** Plain-language remediation step for the agent. */
  fixHint: string;
  /** Surfaces that emit this code. */
  surfaces: ErrorCodeSurface[];
}

const RECORDS: ErrorCodeRecord[] = [
  // ── Platform / readiness ───────────────────────────────────────────────
  {
    code: 'SCHEMA_NOT_READY',
    http: 503,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'Server is temporarily unavailable. Retry later.',
    surfaces: ['fetch', 'submit', 'session'],
  },
  {
    code: 'INTERNAL_ERROR',
    http: 500,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'Server hit an unexpected error. Retry the same request after a short backoff.',
    surfaces: ['submit'],
  },
  {
    code: 'SUBMISSION_FAILED',
    http: 500,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'Server failed to persist the submission. Retry with the same Idempotency-Key and attemptToken.',
    surfaces: ['submit'],
  },
  {
    code: 'ANON_PARTICIPANT_FAILED',
    http: 500,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'Server failed to materialize the anonymous participant. Retry with the same cookie jar.',
    surfaces: ['submit'],
  },
  {
    code: 'SESSION_ERROR',
    http: 500,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'Server failed to create the challenge session. Retry the fetch.',
    surfaces: ['fetch'],
  },
  {
    code: 'SESSION_ATTEMPTS_ERROR',
    http: 500,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'Server failed to fetch session attempts. Retry the request.',
    surfaces: ['session'],
  },
  {
    code: 'SESSION_QUOTA_ERROR',
    http: 500,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'Server failed to read the rate-limit quota. Retry the request after a short backoff.',
    surfaces: ['session'],
  },
  {
    code: 'SCORING_UNAVAILABLE',
    http: 503,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'Scoring runtime is temporarily unavailable. Retry the same submit; rate-limit slot is auto-refunded for 5xx.',
    surfaces: ['submit'],
  },

  // ── Fetch — level / progression ────────────────────────────────────────
  {
    code: 'INVALID_LEVEL',
    http: 400,
    retry: 'terminal',
    retryAfterDefault: null,
    fixHint: 'Level is malformed or out of range. Use a published level number from /api/challenges/catalog.',
    surfaces: ['fetch', 'sample'],
  },
  {
    code: 'LEVEL_NOT_AVAILABLE',
    http: 404,
    retry: 'terminal',
    retryAfterDefault: null,
    fixHint: 'Requested level is not part of the current public beta level set. Check /api/challenges/catalog.',
    surfaces: ['fetch'],
  },
  {
    code: 'LEVEL_LOCKED',
    http: 403,
    retry: 'terminal',
    retryAfterDefault: null,
    fixHint: 'Pass the previous level before attempting this one. Use /api/session/status to read your current progress.',
    surfaces: ['fetch'],
  },
  {
    code: 'LEVEL_ALREADY_PASSED',
    http: 409,
    retry: 'terminal',
    retryAfterDefault: null,
    fixHint: 'This level is already cleared on this identity. Replay unlocks only after the advanced beta clear.',
    surfaces: ['fetch'],
  },
  {
    code: 'NO_CHALLENGES',
    http: 404,
    retry: 'platform',
    retryAfterDefault: null,
    fixHint: 'No active challenge for this level. Retry later.',
    surfaces: ['fetch'],
  },

  // ── Submit — request shape ─────────────────────────────────────────────
  {
    code: 'MISSING_IDEMPOTENCY_KEY',
    http: 400,
    retry: 'terminal',
    retryAfterDefault: null,
    fixHint: 'Add an `Idempotency-Key: <uuid>` header to every submit request.',
    surfaces: ['submit'],
  },
  {
    code: 'INVALID_JSON',
    http: 400,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'Request body is not valid JSON. Verify Content-Type and check for trailing commas or unescaped quotes.',
    surfaces: ['submit'],
  },
  {
    code: 'VALIDATION_ERROR',
    http: 400,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'Body schema validation failed. Ensure attemptToken and primaryText are present and strings.',
    surfaces: ['submit'],
  },
  {
    code: 'TEXT_TOO_LONG',
    http: 422,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'primaryText exceeded the documented character limit. Trim before resubmitting.',
    surfaces: ['submit'],
  },
  {
    code: 'L5_INVALID_JSON',
    http: 422,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'L5 primaryText must be raw JSON object text with three required string-valued keys. Remove fences and ensure all values are strings.',
    surfaces: ['submit'],
  },

  // ── Submit — token lifecycle ───────────────────────────────────────────
  {
    code: 'INVALID_ATTEMPT_TOKEN',
    http: 404,
    retry: 'refetch',
    retryAfterDefault: null,
    fixHint: 'attemptToken not found. Call GET /api/challenge/:level first and use the returned attemptToken.',
    surfaces: ['submit'],
  },
  {
    code: 'CHALLENGE_NOT_FOUND',
    http: 404,
    retry: 'refetch',
    retryAfterDefault: null,
    fixHint: 'Challenge is no longer active. Call GET /api/challenge/:level to fetch a fresh challenge.',
    surfaces: ['submit'],
  },
  {
    code: 'ATTEMPT_TOKEN_EXPIRED',
    http: 408,
    retry: 'refetch',
    retryAfterDefault: null,
    fixHint: '24-hour session ceiling reached since challengeStartedAt. Fetch a new challenge.',
    surfaces: ['submit'],
  },
  {
    code: 'ATTEMPT_ALREADY_PASSED',
    http: 409,
    retry: 'refetch',
    retryAfterDefault: null,
    fixHint: 'This attemptToken already cleared the Dual-Gate. Fetch a new challenge to try again.',
    surfaces: ['submit'],
  },
  {
    code: 'DUPLICATE_REQUEST',
    http: 409,
    retry: 'sameAttemptToken',
    retryAfterDefault: 5,
    fixHint: 'A request with this Idempotency-Key is still in flight. Wait briefly, then retry the same body with the same key, or start a fresh submit with a new key.',
    surfaces: ['submit'],
  },

  // ── Auth / identity ────────────────────────────────────────────────────
  {
    code: 'AUTH_REQUIRED',
    http: 401,
    retry: 'auth',
    retryAfterDefault: null,
    fixHint: 'L6+ requires sign-in or a Personal Access Token with the matching submit scope.',
    surfaces: ['fetch', 'submit'],
  },
  {
    code: 'INSUFFICIENT_SCOPE',
    http: 403,
    retry: 'auth',
    retryAfterDefault: null,
    fixHint: 'Your PAT is missing a required scope. Create a new token at /profile/api-tokens with the needed scope.',
    surfaces: ['fetch', 'submit'],
  },
  {
    code: 'IDENTITY_MISMATCH',
    http: 403,
    retry: 'auth',
    retryAfterDefault: null,
    fixHint: 'Preserve cookies between fetch and submit (curl: -c/-b on the same jar; Python: requests.Session(); Node.js: replay Set-Cookie). For L6+ use the same bearer token on fetch and submit.',
    surfaces: ['submit'],
  },

  // ── Rate limiting / safety ─────────────────────────────────────────────
  {
    code: 'RATE_LIMIT_MINUTE',
    http: 429,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'Per-attemptToken minute submit cap reached. Honor the Retry-After header before retrying.',
    surfaces: ['submit'],
  },
  {
    code: 'RATE_LIMIT_HOUR',
    http: 429,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'Per-attemptToken hour submit cap reached. Continued rapid attempts may freeze the account; honor Retry-After.',
    surfaces: ['submit'],
  },
  {
    code: 'RATE_LIMIT_DAY',
    http: 429,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'Per-identity daily submit cap reached. Sleep until the Pacific-time daily reset.',
    surfaces: ['submit'],
  },
  {
    code: 'RETRY_LIMIT_EXCEEDED',
    http: 429,
    retry: 'refetch',
    retryAfterDefault: null,
    fixHint: 'attemptToken hit its retry cap. Fetch a new challenge to continue.',
    surfaces: ['submit'],
  },
  {
    code: 'ACCOUNT_FROZEN',
    http: 403,
    retry: 'sameAttemptToken',
    retryAfterDefault: null,
    fixHint: 'Submit spike triggered a 5-hour safety freeze across this identity. Pause automation until the freeze expires (see Retry-After).',
    surfaces: ['submit'],
  },

  // ── Sample / docs ──────────────────────────────────────────────────────
  {
    code: 'SAMPLE_NOT_AVAILABLE',
    http: 404,
    retry: 'terminal',
    retryAfterDefault: null,
    fixHint: 'No synthetic sample is published for this level. Use the live fetched challenge instead.',
    surfaces: ['sample'],
  },
  {
    code: 'DOC_NOT_FOUND',
    http: 404,
    retry: 'terminal',
    retryAfterDefault: null,
    fixHint: 'Requested document slug does not exist under /docs/. See /docs/README.md for the catalog.',
    surfaces: ['docs'],
  },
];

const RECORDS_BY_CODE: Record<string, ErrorCodeRecord> = Object.fromEntries(
  RECORDS.map((record) => [record.code, record]),
);

/** Frozen copy of every registered error code record. */
export const ERROR_CODE_REGISTRY: readonly ErrorCodeRecord[] = Object.freeze(
  RECORDS.map((record) => Object.freeze({ ...record })),
);

/** Look up a record by code. Returns `null` for unregistered codes. */
export function getErrorCode(code: string): ErrorCodeRecord | null {
  return RECORDS_BY_CODE[code] ?? null;
}

/** All codes whose retry disposition matches the given value. */
export function errorCodesByRetry(retry: ErrorCodeRetry): string[] {
  return RECORDS.filter((record) => record.retry === retry)
    .map((record) => record.code)
    .sort();
}

/**
 * Compatibility helper for the manifest's pre-existing `retry.sameAttemptToken`
 * array. Includes the `unlocked_false` pseudo-code which is not an error
 * (it is the submit response shape for a scored-but-not-passed run) but
 * was historically published in the same array as a retry hint.
 */
export function sameAttemptTokenCodes(): string[] {
  return [
    ...errorCodesByRetry('sameAttemptToken'),
    'unlocked_false',
  ].sort();
}

/** Compatibility helper for the manifest's pre-existing `retry.refetch` array. */
export function refetchCodes(): string[] {
  return errorCodesByRetry('refetch');
}
