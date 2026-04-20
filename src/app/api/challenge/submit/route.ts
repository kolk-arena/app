/**
 * POST /api/challenge/submit — Submit a solution for scoring
 *
 * Retry-until-pass flow (see docs/SUBMISSION_API.md §Retry After a Failed Submission):
 * 1. Idempotency-Key header required
 * 2. Check idempotency cache
 * 3. Parse body (accepts attemptToken primary + fetchToken legacy alias)
 * 4. Validate session by attemptToken -> ka_challenge_sessions row
 * 5. Reject if already consumed by a prior passing submission (409 ATTEMPT_ALREADY_PASSED)
 * 6. Enforce 24h deadline (408 ATTEMPT_TOKEN_EXPIRED)
 * 7. Identity-bind: session owner must match caller
 * 8. Rate-limit per attemptToken (6/min, 40/hour) — not per account; 5xx refund via releaseClaimsOnServerFailure
 * 9. Run scoring (L0 deterministic check or Layer 1 -> AI judge)
 * 10. Persist submission (multiple submissions per session allowed)
 * 11. Mark consumed_at only if Dual-Gate cleared
 * 12. Update leaderboard if passed
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertRuntimeSchemaReady, supabaseAdmin } from '@/lib/kolk/db';
import { SubmissionInputSchema, type SubmissionResult } from '@/lib/kolk/types';
import { hashCode, readAnonTokenCookie } from '@/lib/kolk/auth';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { missingScopes, SCOPES, type Scope } from '@/lib/kolk/tokens';
import { getLevel } from '@/lib/kolk/levels';
import { runLayer1, type Layer1Config } from '@/lib/kolk/evaluator/layer1';
import { runJudge, type JudgeResult } from '@/lib/kolk/evaluator/judge';
import { MAX_PRIMARY_TEXT_CHARS, STRUCTURE_MAX } from '@/lib/kolk/constants';
import type { VariantRubric } from '@/lib/kolk/types';
import { getAiReadinessSummary } from '@/lib/kolk/ai';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  colorBandToQualityLabel,
  computeSolveTimeSeconds,
  hasEfficiencyBadge,
  isAiJudgedLevel,
  isDualGateUnlock,
  isLeaderboardEligible,
  isRankedBetaLevel,
  scoreToColorBand,
} from '@/lib/kolk/beta-contract';
import {
  buildSubmissionIdentity,
  claimAttemptSubmitSlot,
  claimIdentitySubmitAttempt,
  releaseAttemptSubmitSlot,
  releaseIdentitySubmitAttempt,
  type SubmissionIdentity,
} from '@/lib/kolk/submission-guards';

function parseL5Json(text: string): { ok: true } | { ok: false; message: string; parserPosition?: string } {
  const trimmed = text.trim();

  if (/^```/.test(trimmed)) {
    return {
      ok: false,
      message: 'Remove the Markdown code fences. L5 primaryText must be raw JSON.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    const parserPositionMatch = /position\s+(\d+)/i.exec(message);
    return {
      ok: false,
      message: `L5 primaryText must be a valid JSON object string. ${message}`,
      parserPosition: parserPositionMatch ? `position ${parserPositionMatch[1]}` : undefined,
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      message: 'L5 primaryText must be a JSON object with string values for whatsapp_message, quick_facts, and first_step_checklist.',
    };
  }

  const obj = parsed as Record<string, unknown>;
  const invalidKeys = ['whatsapp_message', 'quick_facts', 'first_step_checklist']
    .filter((key) => typeof obj[key] !== 'string');

  if (invalidKeys.length > 0) {
    return {
      ok: false,
      message: `Missing or non-string L5 key(s): ${invalidKeys.join(', ')}.`,
    };
  }

  return { ok: true };
}

function zeroQualitySubscores() {
  return {
    toneFit: 0,
    clarity: 0,
    usefulness: 0,
    businessFit: 0,
  };
}

type ErrorResponseInit = {
  keyHash: string;
  status: number;
  code: string;
  message: string;
  fixHint?: string;
  headers?: HeadersInit;
  bodyExtras?: Record<string, unknown>;
};

async function errorResponse({
  keyHash,
  status,
  code,
  message,
  fixHint,
  headers,
  bodyExtras,
}: ErrorResponseInit): Promise<NextResponse> {
  const body = { error: message, code, ...(fixHint ? { fix_hint: fixHint } : {}), ...(bodyExtras ?? {}) };

  if (status < 500) {
    // Extend TTL from the 5-minute pending claim to the documented 24h
    // idempotency cache window so a retry with the same key is a cache hit.
    void supabaseAdmin
      .from('ka_idempotency_keys')
      .update({
        response: body,
        status_code: status,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('key_hash', keyHash);
  } else {
    void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
  }

  return NextResponse.json(body, {
    status,
    headers,
  });
}

function buildFailReason(structureScore: number, coverageScore: number, qualityScore: number) {
  if (structureScore < 25) return 'STRUCTURE_GATE' as const;
  if (coverageScore + qualityScore < 15) return 'QUALITY_FLOOR' as const;
  return null;
}

async function computePercentile(level: number, totalScore: number): Promise<number | null> {
  const cohortFloor = 10;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: cohortRows, error } = await supabaseAdmin
    .from('ka_submissions')
    .select('total_score')
    .eq('level', level)
    .eq('leaderboard_eligible', true)
    .gte('submitted_at', since);

  if (error) {
    console.warn('[submit] Percentile query failed:', error);
    return null;
  }

  const scores = (cohortRows ?? [])
    .map((row) => (typeof row.total_score === 'number' ? row.total_score : Number(row.total_score ?? NaN)))
    .filter((value) => Number.isFinite(value));

  if (scores.length < cohortFloor) {
    return null;
  }

  const beaten = scores.filter((score) => score < totalScore).length;
  return Math.min(99, Math.max(0, Math.floor((beaten / scores.length) * 100)));
}

async function loadBestLeaderboardRun(participantId: string, level: number) {
  const { data } = await supabaseAdmin
    .from('ka_submissions')
    .select('total_score, color_band, quality_label, solve_time_seconds, efficiency_badge, submitted_at')
    .eq('participant_id', participantId)
    .eq('level', level)
    .eq('unlocked', true)
    .order('total_score', { ascending: false })
    .order('solve_time_seconds', { ascending: true, nullsFirst: false })
    .order('submitted_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

async function updateLeaderboard(input: {
  participantId: string;
  level: number;
  score: number;
  countryCode?: string | null;
}) {
  const { participantId, level, score, countryCode } = input;

  const [{ data: existing }, { data: user }] = await Promise.all([
    supabaseAdmin.from('ka_leaderboard').select('*').eq('participant_id', participantId).single(),
    supabaseAdmin
      .from('ka_users')
      .select('display_name, handle, agent_stack, affiliation')
      .eq('id', participantId)
      .single(),
  ]);

  const bestScores = existing && existing.best_scores && typeof existing.best_scores === 'object'
    ? { ...(existing.best_scores as Record<string, number>) }
    : {};

  if (score > Number(bestScores[String(level)] ?? 0)) {
    bestScores[String(level)] = score;
  }

  const totalScore = Object.values(bestScores).reduce((sum, value) => sum + Number(value), 0);
  const levelsCompleted = Object.keys(bestScores).length;
  const highestLevel = Math.max(0, ...Object.keys(bestScores).map(Number));
  const bestRun = highestLevel > 0 ? await loadBestLeaderboardRun(participantId, highestLevel) : null;

  const payload: Record<string, unknown> = {
    total_score: totalScore,
    levels_completed: levelsCompleted,
    highest_level: highestLevel,
    best_scores: bestScores,
    best_score_on_highest: bestRun?.total_score ?? Number(bestScores[String(highestLevel)] ?? 0),
    best_color_band: typeof bestRun?.color_band === 'string' ? bestRun.color_band : null,
    best_quality_label: typeof bestRun?.quality_label === 'string' ? bestRun.quality_label : null,
    solve_time_seconds:
      typeof bestRun?.solve_time_seconds === 'number'
        ? bestRun.solve_time_seconds
        : bestRun?.solve_time_seconds != null
        ? Number(bestRun.solve_time_seconds)
        : null,
    efficiency_badge: bestRun?.efficiency_badge === true,
    tier: computeTier(highestLevel, levelsCompleted),
    display_name: user?.display_name ?? null,
    handle: user?.handle ?? null,
    agent_stack: user?.agent_stack ?? null,
    affiliation: user?.affiliation ?? null,
    pioneer: highestLevel >= 8,
    last_submission_at: bestRun?.submitted_at ?? new Date().toISOString(),
  };

  if (countryCode) {
    payload.country_code = countryCode;
  }

  if (existing) {
    await supabaseAdmin
      .from('ka_leaderboard')
      .update(payload)
      .eq('participant_id', participantId);
  } else {
    await supabaseAdmin.from('ka_leaderboard').insert({
      participant_id: participantId,
      ...payload,
    });
  }
}

function normalizeCountryCode(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

async function updateMaxLevel(participantId: string, level: number) {
  const { data: user } = await supabaseAdmin
    .from('ka_users')
    .select('max_level, pioneer')
    .eq('id', participantId)
    .single();

  if (user && (level > (user.max_level ?? 0) || (level >= 8 && user.pioneer !== true))) {
    await supabaseAdmin
      .from('ka_users')
      .update({
        max_level: Math.max(level, user.max_level ?? 0),
        pioneer: level >= 8 ? true : user.pioneer === true,
      })
      .eq('id', participantId);
  }
}

function computeTier(highestLevel: number, levelsCompleted: number): string {
  if (highestLevel >= 8 && levelsCompleted >= 8) return 'builder';
  if (highestLevel >= 6 && levelsCompleted >= 6) return 'builder';
  return 'starter';
}

export async function POST(request: NextRequest) {
  let keyHash: string = '';
  // Launch-week policy (2026-04-20): any 5xx exit AFTER we've claimed a
  // rate-limit slot must unwind the claim — server-side failures like
  // judge 503s or DB insert errors are NOT the player's fault and must
  // not eat their minute/hour/day quota. Paired with migration 00016.
  let claimedAttemptToken: string | null = null;
  let claimedIdentity: SubmissionIdentity | null = null;
  const releaseClaimsOnServerFailure = async () => {
    const pendingAttempt = claimedAttemptToken
      ? releaseAttemptSubmitSlot(claimedAttemptToken)
      : Promise.resolve();
    const pendingIdentity = claimedIdentity
      ? releaseIdentitySubmitAttempt(claimedIdentity)
      : Promise.resolve();
    // Clear BEFORE awaiting so a duplicate call (e.g. from the outer
    // catch firing after an inner release already ran) is a no-op.
    claimedAttemptToken = null;
    claimedIdentity = null;
    await Promise.allSettled([pendingAttempt, pendingIdentity]);
  };

  try {
    try {
      await assertRuntimeSchemaReady();
    } catch (error) {
      console.error('[submit] Runtime schema check failed:', error);
      return NextResponse.json(
        { error: 'Submission service is not ready. Apply the latest database migrations.', code: 'SCHEMA_NOT_READY' },
        { status: 503 },
      );
    }

    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required', code: 'MISSING_IDEMPOTENCY_KEY' },
        { status: 400 },
      );
    }

    keyHash = hashCode(idempotencyKey);

    const { data: cached } = await supabaseAdmin
      .from('ka_idempotency_keys')
      .select('response, status_code')
      .eq('key_hash', keyHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cached) {
      return NextResponse.json(cached.response, { status: cached.status_code });
    }

    // Claim the idempotency key with a SHORT expiry. If this request crashes
    // (e.g. Vercel OOM / timeout) the pending row self-expires in 5 minutes
    // instead of locking the key for the full 24h idempotency window.
    // On success or recoverable error, we extend expires_at to 24h below.
    // First, evict any stuck pending claim from a previous crashed request
    // that shares the same key hash.
    await supabaseAdmin
      .from('ka_idempotency_keys')
      .delete()
      .eq('key_hash', keyHash)
      .lt('expires_at', new Date().toISOString());

    const { error: claimError } = await supabaseAdmin
      .from('ka_idempotency_keys')
      .insert({
        key_hash: keyHash,
        response: { status: 'pending' },
        status_code: 202,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

    if (claimError) {
      return NextResponse.json(
        { error: 'Request already in progress', code: 'DUPLICATE_REQUEST' },
        { status: 409 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse({
        keyHash,
        status: 400,
        code: 'INVALID_JSON',
        message: 'Invalid JSON body',
        fixHint:
          'Ensure your request body is valid JSON and Content-Type is application/json. Check for trailing commas or unescaped quotes.',
      });
    }

    const parsed = SubmissionInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        keyHash,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Validation failed',
        fixHint:
          'Body schema validation failed. Ensure attemptToken and primaryText are present and strings. See docs/SUBMISSION_API.md.',
      });
    }

    const { attemptToken, primaryText, repoUrl, commitHash } = parsed.data;

    if (primaryText.length > MAX_PRIMARY_TEXT_CHARS) {
      return errorResponse({
        keyHash,
        status: 422,
        code: 'TEXT_TOO_LONG',
        message: `primaryText exceeds ${MAX_PRIMARY_TEXT_CHARS} character limit`,
        fixHint:
          'primaryText exceeds 50000 character limit. Trim your delivery before resubmitting.',
      });
    }

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('ka_challenge_sessions')
      .select('*')
      .eq('attempt_token', attemptToken)
      .single();

    if (sessionErr || !session) {
      return errorResponse({
        keyHash,
        status: 404,
        code: 'INVALID_ATTEMPT_TOKEN',
        message: 'attemptToken not found. You must call GET /api/challenge/:level first and use the returned attemptToken.',
        fixHint: 'Call GET /api/challenge/:level to fetch a valid attemptToken before submitting.',
      });
    }

    // Retry-until-pass semantics: consumed_at is set only when a prior
    // submission cleared the Dual-Gate. See docs/SUBMISSION_API.md.
    if (session.consumed_at) {
      return errorResponse({
        keyHash,
        status: 409,
        code: 'ATTEMPT_ALREADY_PASSED',
        message: 'This attemptToken has already been used for a passing submission. Fetch a new challenge to try again.',
        fixHint:
          'This attemptToken has already cleared the Dual-Gate. Fetch a new challenge with GET /api/challenge/:level to try again.',
      });
    }

    const challengeId = session.challenge_id as string;
    const sessionParticipantId = session.participant_id as string | null;
    const sessionAnonToken = session.anon_token as string | null;

    let callerParticipantId: string | null = null;
    let callerAnonToken: string | null = null;
    let callerScopes: Scope[] | null = null;
    let callerEmail: string | null = null;

    const arenaAuth = await resolveArenaAuthContext(request);
    if (arenaAuth?.user.is_verified) {
      callerParticipantId = arenaAuth.user.id;
      callerScopes = arenaAuth.scopes; // null for session, array for PAT
      callerEmail = arenaAuth.user.email;
    } else {
      callerAnonToken = readAnonTokenCookie(request);
    }

    if (sessionParticipantId) {
      if (callerParticipantId !== sessionParticipantId) {
        return errorResponse({
          keyHash,
          status: 403,
          code: 'IDENTITY_MISMATCH',
          message: 'This attemptToken belongs to a different user. You cannot submit on behalf of another account.',
          fixHint:
            'Preserve cookies between GET /api/challenge/:level and POST /api/challenge/submit. curl: use -c/-b. Python: requests.Session(). Node.js: read Set-Cookie from GET and replay on POST.',
        });
      }
    } else if (sessionAnonToken) {
      if (callerAnonToken !== sessionAnonToken) {
        return errorResponse({
          keyHash,
          status: 403,
          code: 'IDENTITY_MISMATCH',
          message: 'This attemptToken belongs to a different anonymous session.',
          fixHint:
            'Preserve cookies between GET /api/challenge/:level and POST /api/challenge/submit. curl: use -c/-b. Python: requests.Session(). Node.js: read Set-Cookie from GET and replay on POST.',
        });
      }
    }

    const participantId = sessionParticipantId;
    const anonToken = sessionAnonToken;
    const requesterCountryCode = normalizeCountryCode(request.headers.get('x-vercel-ip-country'));
    const submissionIdentity = buildSubmissionIdentity({
      email: callerEmail,
      userId: participantId,
      anonSessionToken: anonToken,
    });

    const now = new Date();
    const deadlineUtc = new Date(session.deadline_utc as string);
    const challengeStartedAt = new Date(session.started_at as string);

    if (now > deadlineUtc) {
      return errorResponse({
        keyHash,
        status: 408,
        code: 'ATTEMPT_TOKEN_EXPIRED',
        message: `This attemptToken has expired (24-hour session ceiling reached). Fetch a new challenge and try again.`,
        fixHint: 'Fetch a new challenge; the 24-hour session ceiling has elapsed.',
      });
    }

    const { data: challenge, error: chalError } = await supabaseAdmin
      .from('ka_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('active', true)
      .single();

    if (chalError || !challenge) {
      return errorResponse({
        keyHash,
        status: 404,
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Challenge not found or inactive',
        fixHint: 'Verify the challengeId and ensure it is active. Use GET /api/challenge to fetch a valid active challenge.'
      });
    }

    if (!participantId && challenge.level > ANONYMOUS_BETA_MAX_LEVEL) {
      return errorResponse({
        keyHash,
        status: 401,
        code: 'AUTH_REQUIRED',
        message: `Authentication required for level ${challenge.level}`,
        fixHint:
          'Levels 6-8 require sign-in or a Personal Access Token with submit_ranked scope. See /profile and docs/API_TOKENS.md.',
      });
    }

    // Scope enforcement (PAT-authenticated callers only; session callers unrestricted).
    // See docs/API_TOKENS.md §Scopes.
    if (callerScopes !== null) {
      const requiredScope: Scope = challenge.level === 0 ? SCOPES.SUBMIT_ONBOARDING : SCOPES.SUBMIT_RANKED;
      const missing = missingScopes(callerScopes, [requiredScope]);
      if (missing.length > 0) {
        return errorResponse({
          keyHash,
          status: 403,
          code: 'INSUFFICIENT_SCOPE',
          message: `This Personal Access Token is missing the ${missing.join(', ')} scope required to submit for level ${challenge.level}.`,
          fixHint:
            'Your PAT is missing a required scope. Create a new token at /profile/api-tokens with the needed scope.',
        });
      }
    }

    if (!submissionIdentity) {
      return errorResponse({
        keyHash,
        status: 403,
        code: 'IDENTITY_MISMATCH',
        message: 'A valid signed-in identity or anonymous session cookie is required to submit this attemptToken.',
        fixHint: 'Provide your valid session cookie or an authenticated PAT to submit against this attemptToken.'
      });
    }

    const identityGuard = await claimIdentitySubmitAttempt(submissionIdentity);
    if (!identityGuard.allowed) {
      if (identityGuard.code === 'ACCOUNT_FROZEN') {
        return errorResponse({
          keyHash,
          status: 403,
          code: 'ACCOUNT_FROZEN',
          message: identityGuard.frozenUntil
            ? `Your account has been temporarily frozen due to excessive submission attempts. Unfreezes at ${identityGuard.frozenUntil}.`
            : 'Your account has been temporarily frozen due to excessive submission attempts.',
          fixHint: 'Check the Retry-After header and pause automated submissions until the freeze period expires.',
          headers: {
            'Retry-After': String(identityGuard.retryAfterSeconds),
          },
          bodyExtras: {
            retryAfter: identityGuard.retryAfterSeconds,
            frozenUntil: identityGuard.frozenUntil,
            reason: identityGuard.reason,
            limits: {
              day: identityGuard.day,
              minute: identityGuard.windows
                ? { used: identityGuard.windows.minuteUsed, max: identityGuard.windows.minuteThreshold }
                : undefined,
              fiveMinute: identityGuard.windows
                ? { used: identityGuard.windows.fiveMinUsed, max: identityGuard.windows.fiveMinThreshold }
                : undefined,
            },
          },
        });
      }

      return errorResponse({
        keyHash,
        status: 429,
        code: 'RATE_LIMIT_DAY',
        message: 'Daily submit limit reached for this identity. Try again after the Pacific-time reset.',
        fixHint: 'Daily rate limit exhausted. Sleep your agent until the Pacific-time reset.',
        headers: {
          'Retry-After': String(identityGuard.retryAfterSeconds),
        },
        bodyExtras: {
          retryAfter: identityGuard.retryAfterSeconds,
          limits: {
            day: identityGuard.day,
          },
        },
      });
    }

    const attemptGuard = await claimAttemptSubmitSlot(attemptToken);
    if (!attemptGuard.allowed) {
      if (attemptGuard.code === 'RETRY_LIMIT_EXCEEDED') {
        return errorResponse({
          keyHash,
          status: 429,
          code: 'RETRY_LIMIT_EXCEEDED',
          message: 'This token has reached the 10-submit cap. Fetch a new challenge to continue.',
          fixHint: 'Maximum retries for this attemptToken reached. Call GET /api/challenge again to fetch a new token.',
          bodyExtras: {
            limits: {
              minute: attemptGuard.minute,
              hour: attemptGuard.hour,
              day: identityGuard.day,
              retry: attemptGuard.retry,
            },
          },
        });
      }

      const code = attemptGuard.code;
      const message = code === 'RATE_LIMIT_HOUR'
        ? `${attemptGuard.hour.max} submissions per hour for this challenge. Try again in ${attemptGuard.retryAfterSeconds} seconds. Warning: continued rapid attempts may result in a 5-hour account freeze.`
        : `Submit rate limit exceeded. Maximum ${attemptGuard.minute.max} submissions per minute per attemptToken. Retry after ${attemptGuard.retryAfterSeconds}s.`;

      return errorResponse({
        keyHash,
        status: 429,
        code,
        message,
        fixHint: 'Honor the Retry-After header before making the next submission attempt.',
        headers: {
          'Retry-After': String(attemptGuard.retryAfterSeconds),
        },
        bodyExtras: {
          retryAfter: attemptGuard.retryAfterSeconds,
          limits: {
            minute: attemptGuard.minute,
            hour: attemptGuard.hour,
            day: identityGuard.day,
            retry: attemptGuard.retry,
          },
        },
      });
    }

    // Both rate-limit slots are now claimed. Track them so any subsequent
    // 5xx (SCORING_UNAVAILABLE, SUBMISSION_FAILED, uncaught) can release.
    claimedAttemptToken = attemptToken;
    claimedIdentity = submissionIdentity;

    if (challenge.level === 5) {
      const l5Json = parseL5Json(primaryText);
      if (!l5Json.ok) {
        return errorResponse({
          keyHash,
          status: 422,
          code: 'L5_INVALID_JSON',
          message: l5Json.message,
          fixHint: 'Ensure your payload is ONLY raw JSON. Remove markdown formatting (like ```json). Verify all required string keys are present.',
          headers: l5Json.parserPosition
            ? {
                'X-Parser-Position': l5Json.parserPosition,
              }
            : undefined,
          bodyExtras: l5Json.parserPosition
            ? {
                parser_position: l5Json.parserPosition,
              }
            : undefined,
        });
      }
    }

    const submittedAt = new Date();
    const solveTimeSeconds = computeSolveTimeSeconds(challengeStartedAt, submittedAt);
    const fetchToSubmitSeconds = solveTimeSeconds;
    const aiJudged = isAiJudgedLevel(challenge.level);

    let structureScore = 0;
    let coverageScore = 0;
    let qualityScore = 0;
    let fieldScores: Array<{ field: string; score: number; reason: string }> = [];
    let qualitySubscores = zeroQualitySubscores();
    let flags: string[] = [];
    let summary = '';
    let judgeModel = aiJudged ? 'judge-runtime-unavailable' : 'deterministic-l0';
    let judgeResult: JudgeResult | null = null;

    if (challenge.level === 0) {
      const passed = /hello|kolk/i.test(primaryText);
      if (!passed) {
        return errorResponse({
          keyHash,
          status: 400,
          code: 'VALIDATION_ERROR',
          message: "L0 submission must contain 'Hello' or 'Kolk' (case-insensitive).",
          fixHint:
            "L0 submission must contain 'Hello' or 'Kolk' (case-insensitive). See docs/LEVELS.md §L0.",
        });
      }

      structureScore = 40;
      coverageScore = 30;
      qualityScore = 30;
      summary = 'L0 onboarding check passed. Your integration is connected.';
    } else {
      const levelDef = getLevel(challenge.level);
      const taskJson = challenge.task_json as Record<string, unknown>;
      const structuredBrief = (taskJson.structured_brief ?? {}) as Record<string, unknown>;

      const layer1Config: Layer1Config = {};

      if (challenge.level === 5) {
        layer1Config.jsonStringFields = {
          requiredKeys: ['whatsapp_message', 'quick_facts', 'first_step_checklist'],
          minLengths: {
            whatsapp_message: 51,
            quick_facts: 101,
            first_step_checklist: 51,
          },
        };
      } else if (challenge.level === 8) {
        layer1Config.requiredHeaderKeywords = ['copy', 'prompt', 'whatsapp'];
      } else {
        const targetLang = structuredBrief.target_lang as string | undefined;
        const sellerLocale = taskJson.seller_locale as string | undefined;
        const expectedLang = targetLang ?? sellerLocale;
        if (expectedLang) layer1Config.expectedLang = expectedLang;

        const budgetTotal = structuredBrief.budget_total as number | undefined;
        if (budgetTotal != null) layer1Config.mathTotal = budgetTotal;

        const expectedCount = (
          structuredBrief.item_count ??
          structuredBrief.prompt_count ??
          structuredBrief.trip_days ??
          structuredBrief.days
        ) as number | undefined;
        if (expectedCount != null) {
          layer1Config.itemExpected = {
            count: expectedCount,
            patterns: [/^#{1,3}\s+/gm, /^\d+\.\s+/gm, /^[-*]\s+/gm, /"(?:id|name|title)":/g],
            label: 'items',
          };
        }

        const keyFacts = (structuredBrief.key_facts ?? structuredBrief.facts ?? []) as string[];
        if (keyFacts.length > 0) layer1Config.facts = keyFacts;

        const prohibitedTerms = (structuredBrief.prohibited_terms ?? []) as string[];
        if (prohibitedTerms.length > 0) {
          layer1Config.prohibitedTerms = {
            terms: prohibitedTerms,
            lang: (sellerLocale?.startsWith('es') ? 'es' : 'en') as 'es' | 'en',
          };
        }
      }

      const layer1 = runLayer1(primaryText, layer1Config);
      structureScore = layer1.totalScore;
      fieldScores = layer1.checks.map((check) => ({
        field: check.name,
        score: check.score,
        reason: check.reason,
      }));

      if (structureScore >= 25) {
        const aiReadiness = getAiReadinessSummary();
        if (!aiReadiness.scoringReady) {
          await releaseClaimsOnServerFailure();
          return errorResponse({
            keyHash,
            status: 503,
            code: 'SCORING_UNAVAILABLE',
            message: aiReadiness.scoringMissingEnvKeys.length > 0
              ? `Scoring is temporarily unavailable. Missing scoring-provider credentials: ${aiReadiness.scoringMissingEnvKeys.join(', ')}.`
              : 'Scoring is temporarily unavailable. Please try again shortly.',
          });
        }

        const { data: rubricRow } = await supabaseAdmin
          .from('ka_variant_rubrics')
          .select('rubric_json')
          .eq('level', challenge.level)
          .eq('variant', challenge.variant ?? 'default')
          .single();

        if (!rubricRow?.rubric_json) {
          await releaseClaimsOnServerFailure();
          return errorResponse({
            keyHash,
            status: 503,
            code: 'SCORING_UNAVAILABLE',
            message: 'Scoring is temporarily unavailable. Please try again shortly.',
          });
        }

        const raw = rubricRow.rubric_json as Record<string, unknown>;
        const rubric: VariantRubric = {
          level: challenge.level as number,
          variant: (challenge.variant ?? 'default') as string,
          rubricHash: '',
          coverageFieldWeights: (raw.coverageFieldWeights ?? raw.coverage_field_weights ?? {}) as Record<string, number>,
          qualityAnchors: (raw.qualityAnchors ?? raw.quality_anchors ?? {}) as Record<string, string>,
          idealExcerpt: (raw.idealExcerpt ?? raw.ideal_excerpt ?? '') as string,
          activePenalties: (raw.activePenalties ?? raw.active_penalties ?? []) as string[],
          penaltyConfig: (raw.penaltyConfig ?? raw.penalty_config ?? {}) as Record<string, { deduction: number; appliedTo: 'coverage' | 'quality' }>,
        };
        const briefSummary = (taskJson.brief_summary ?? taskJson.title ?? `Level ${challenge.level} challenge`) as string;

        judgeResult = await runJudge(
          primaryText,
          rubric,
          briefSummary,
          levelDef.name,
          challenge.level,
          attemptToken,
        );
        if (judgeResult.error) {
          await releaseClaimsOnServerFailure();
          return errorResponse({
            keyHash,
            status: 503,
            code: 'SCORING_UNAVAILABLE',
            message: 'Scoring is temporarily unavailable. Please try again shortly.',
          });
        }

        coverageScore = judgeResult.coverageScore;
        qualityScore = judgeResult.qualityScore;
        qualitySubscores = judgeResult.qualitySubscores;
        flags = judgeResult.flags ?? [];
        summary = judgeResult.summary ?? 'Judge scoring complete.';
        judgeModel = judgeResult.model ?? 'judge-unavailable';
      } else {
        summary = `Structural gate failed (${structureScore}/${STRUCTURE_MAX}).`;
      }
    }

    const totalScore = challenge.level === 0 ? 100 : structureScore + coverageScore + qualityScore;
    const unlocked = challenge.level === 0
      ? true
      : isDualGateUnlock(structureScore, coverageScore, qualityScore);
    const colorBand = scoreToColorBand(totalScore);
    const qualityLabel = colorBandToQualityLabel(colorBand);
    const efficiencyBadge = hasEfficiencyBadge(challenge.level, solveTimeSeconds);
    const leaderboardEligible = isLeaderboardEligible(challenge.level, participantId, unlocked);
    const levelUnlocked = unlocked && challenge.level < 8 ? challenge.level + 1 : undefined;
    const showRegisterPrompt = !participantId && challenge.level === 5 && unlocked ? true : undefined;
    const failReason = unlocked ? null : buildFailReason(structureScore, coverageScore, qualityScore);
    const replayUnlocked = challenge.level === 8 && unlocked ? true : undefined;
    const nextSteps = replayUnlocked
      ? {
          replay: 'You can now replay any beta level to improve your best score.',
          discord: 'https://discord.gg/kolkarena',
          share: 'https://twitter.com/intent/tweet?text=My%20AI%20agent%20completed%20all%20Kolk%20Arena%20Beta%20levels!',
        }
      : undefined;

    const { data: submission, error: insertError } = await supabaseAdmin
      .from('ka_submissions')
      .insert({
        challenge_session_id: session.id,
        challenge_id: challengeId,
        participant_id: participantId,
        anon_token: anonToken,
        idempotency_key: idempotencyKey,
        primary_text: primaryText,
        repo_url: repoUrl ?? null,
        commit_hash: commitHash ?? null,
        challenge_started_at: challengeStartedAt.toISOString(),
        deadline_utc: deadlineUtc.toISOString(),
        submitted_at: submittedAt.toISOString(),
        structure_score: structureScore,
        coverage_score: coverageScore,
        quality_score: qualityScore,
        total_score: totalScore,
        field_scores: fieldScores,
        quality_subscores: qualitySubscores,
        flags,
        judge_summary: summary,
        judge_model: judgeModel,
        judge_error: judgeResult?.error ?? false,
        level: challenge.level,
        unlocked,
        color_band: colorBand,
        quality_label: qualityLabel,
        solve_time_seconds: solveTimeSeconds,
        fetch_to_submit_seconds: fetchToSubmitSeconds,
        efficiency_badge: efficiencyBadge,
        ai_judged: aiJudged,
        leaderboard_eligible: leaderboardEligible,
        country_code: requesterCountryCode,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Submission insert error:', insertError);
      // Per migration 00008 we no longer enforce one-submission-per-session;
      // multiple retries are allowed until the Dual-Gate is cleared. A 23505
      // here is therefore not expected and indicates a different unique index
      // violation — treat as a generic failure.
      void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
      // Server-side DB failure — unwind the rate-limit claim so the
      // player isn't punished for our infra problem.
      await releaseClaimsOnServerFailure();
      return NextResponse.json(
        { error: 'Failed to save submission', code: 'SUBMISSION_FAILED' },
        { status: 500 },
      );
    }

    // Consume the attemptToken only when the Dual-Gate is cleared.
    // Failed scored runs leave the token alive for retry within the 24h ceiling.
    if (unlocked) {
      await supabaseAdmin
        .from('ka_challenge_sessions')
        .update({ consumed_at: submittedAt.toISOString() })
        .eq('attempt_token', attemptToken)
        .is('consumed_at', null);
    }

    if (leaderboardEligible && participantId) {
      await updateLeaderboard({
        participantId,
        level: challenge.level,
        score: totalScore,
        countryCode: requesterCountryCode,
      });
    }

    if (participantId && unlocked && isRankedBetaLevel(challenge.level)) {
      await updateMaxLevel(participantId, challenge.level);
    }

    const percentile = isRankedBetaLevel(challenge.level)
      ? await computePercentile(challenge.level, totalScore)
      : null;

    const result: SubmissionResult = {
      submissionId: submission.id,
      challengeId,
      level: challenge.level,
      totalScore,
      flags,
      summary,
      unlocked,
      failReason,
      colorBand,
      qualityLabel,
      percentile,
      solveTimeSeconds,
      fetchToSubmitSeconds,
      efficiencyBadge,
      aiJudged,
      leaderboardEligible,
      showRegisterPrompt,
      levelUnlocked,
      replayUnlocked,
      nextSteps,
      ...(challenge.level === 0
        ? {}
        : {
            structureScore,
            coverageScore,
            qualityScore,
            fieldScores,
            qualitySubscores,
          }),
    };

    const responseBody = result as unknown as Record<string, unknown>;
    // Extend the 5-minute pending claim to the documented 24h idempotency cache
    // window so a retry with the same Idempotency-Key returns the cached body.
    void supabaseAdmin
      .from('ka_idempotency_keys')
      .update({
        response: responseBody,
        status_code: 200,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('key_hash', keyHash);

    return NextResponse.json(responseBody);
  } catch (uncaughtErr) {
    console.error('[submit] Uncaught error:', uncaughtErr);
    if (typeof keyHash === 'string') {
      void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
    }
    // Uncaught failures are server-side by definition — if a claim was
    // in flight, unwind it so the player keeps their minute/hour/day quota.
    await releaseClaimsOnServerFailure();
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
