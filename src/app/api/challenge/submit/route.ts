/**
 * POST /api/challenge/submit — Submit a solution for scoring
 *
 * Session-bound flow:
 * 1. Idempotency-Key header required
 * 2. Check idempotency cache
 * 3. Parse body (requires fetchToken from challenge fetch)
 * 4. Validate session: fetchToken → ka_challenge_sessions row
 * 5. Enforce deadline from server-side session (not client-provided)
 * 6. Check not already submitted for this session
 * 7. Run scoring (Layer 1 structural gate → Layer 2+3 AI judge)
 * 8. Save submission, update leaderboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertRuntimeSchemaReady, supabaseAdmin } from '@/lib/kolk/db';
import { SubmissionInputSchema, type SubmissionResult } from '@/lib/kolk/types';
import { getAnonToken, hashCode } from '@/lib/kolk/auth';
import { resolveArenaUserFromRequest } from '@/lib/kolk/auth/server';
import { getLevel } from '@/lib/kolk/levels';
import { runLayer1, type Layer1Config } from '@/lib/kolk/evaluator/layer1';
import { runJudge, type JudgeResult } from '@/lib/kolk/evaluator/judge';
import { ANONYMOUS_MAX_LEVEL, MAX_PRIMARY_TEXT_CHARS, STRUCTURE_MAX } from '@/lib/kolk/constants';
import type { VariantRubric } from '@/lib/kolk/types';

// ============================================================================
// Simple in-memory rate limiter
// ============================================================================

const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 3600_000;
const RATE_LIMIT_ANON = 30;
const RATE_LIMIT_AUTH = 60;

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const ts = (rateLimitMap.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (ts.length >= max) return false;
  ts.push(now);
  rateLimitMap.set(key, ts);
  return true;
}

const STRUCTURAL_GATE = 25;

export async function POST(request: NextRequest) {
  let keyHash: string | undefined;

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

  // ── Step 1: Idempotency-Key ──
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: 'Idempotency-Key header is required', code: 'MISSING_IDEMPOTENCY_KEY' },
      { status: 400 },
    );
  }

  keyHash = hashCode(idempotencyKey);

  // ── Step 2: Check idempotency cache (only if not expired) ──
  const { data: cached } = await supabaseAdmin
    .from('ka_idempotency_keys')
    .select('response, status_code')
    .eq('key_hash', keyHash)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (cached) {
    return NextResponse.json(cached.response, { status: cached.status_code });
  }

  // Claim idempotency key before scoring (prevents race condition)
  const { error: claimError } = await supabaseAdmin
    .from('ka_idempotency_keys')
    .insert({ key_hash: keyHash, response: { status: 'pending' }, status_code: 202 });

  if (claimError) {
    return NextResponse.json(
      { error: 'Request already in progress', code: 'DUPLICATE_REQUEST' },
      { status: 409 },
    );
  }

  // ── Step 3: Parse body ──
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(keyHash, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const parsed = SubmissionInputSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(keyHash, 400, 'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Validation failed');
  }

  const { fetchToken, primaryText, repoUrl, commitHash } = parsed.data;

  if (primaryText.length > MAX_PRIMARY_TEXT_CHARS) {
    return errorResponse(keyHash, 422, 'TEXT_TOO_LONG',
      `primary_text exceeds ${MAX_PRIMARY_TEXT_CHARS} character limit`);
  }

  // ── Step 4: Validate session via fetchToken ──
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('ka_challenge_sessions')
    .select('*')
    .eq('fetch_token', fetchToken)
    .single();

  if (sessionErr || !session) {
    return errorResponse(keyHash, 404, 'INVALID_FETCH_TOKEN',
      'fetchToken not found. You must call GET /api/challenge/:level first and use the returned fetchToken.');
  }

  if (session.submitted) {
    return errorResponse(keyHash, 409, 'SESSION_ALREADY_SUBMITTED',
      'This challenge session has already been submitted. Fetch a new challenge to try again.');
  }

  const challengeId = session.challenge_id as string;
  const sessionParticipantId = session.participant_id as string | null;
  const sessionAnonToken = session.anon_token as string | null;

  // ── Step 4b: Identity binding — verify caller matches session owner ──
  // Prevents fetchToken theft: the person submitting must be the same identity that fetched.
  let callerParticipantId: string | null = null;
  let callerAnonToken: string | null = null;

  const arenaUser = await resolveArenaUserFromRequest(request);
  if (arenaUser?.is_verified) {
    callerParticipantId = arenaUser.id;
  } else {
    callerAnonToken = getAnonToken(request);
  }

  if (sessionParticipantId) {
    // Session was created by a registered user — caller must be the same user
    if (callerParticipantId !== sessionParticipantId) {
      return errorResponse(keyHash, 403, 'IDENTITY_MISMATCH',
        'This fetchToken belongs to a different user. You cannot submit on behalf of another account.');
    }
  } else if (sessionAnonToken) {
    // Session was created by an anonymous user — caller must have the same anon token
    if (callerAnonToken !== sessionAnonToken) {
      return errorResponse(keyHash, 403, 'IDENTITY_MISMATCH',
        'This fetchToken belongs to a different anonymous session.');
    }
  }

  // Use session identity as the authoritative source
  const participantId = sessionParticipantId;
  const anonToken = sessionAnonToken;

  // ── Step 5: Enforce deadline (server-side, non-negotiable) ──
  const now = new Date();
  const deadlineUtc = new Date(session.deadline_utc as string);
  const challengeStartedAt = new Date(session.started_at as string);

  if (now > deadlineUtc) {
    return errorResponse(keyHash, 408, 'DEADLINE_EXCEEDED',
      `Submission deadline has passed (deadline was ${deadlineUtc.toISOString()}, now is ${now.toISOString()})`);
  }

  // ── Load challenge data ──
  const { data: challenge, error: chalError } = await supabaseAdmin
    .from('ka_challenges')
    .select('*')
    .eq('id', challengeId)
    .eq('active', true)
    .single();

  if (chalError || !challenge) {
    return errorResponse(keyHash, 404, 'CHALLENGE_NOT_FOUND', 'Challenge not found or inactive');
  }

  // Auth check for competitive levels
  if (!participantId && challenge.level > ANONYMOUS_MAX_LEVEL) {
    return errorResponse(keyHash, 401, 'AUTH_REQUIRED',
      `Authentication required for level ${challenge.level}`);
  }

  // ── Rate limiting ──
  const rlKey = participantId ?? anonToken ?? 'unknown';
  if (!checkRateLimit(rlKey, participantId ? RATE_LIMIT_AUTH : RATE_LIMIT_ANON)) {
    return errorResponse(keyHash, 429, 'RATE_LIMITED', 'Rate limit exceeded');
  }

  // ── Step 6: session.submitted is the primary gate ──
  // Submission persistence is also bound to challenge_session_id so replay sessions
  // can submit while concurrent duplicate submits on the same session collapse safely.

  // ── Step 7: Run scoring ──
  const levelDef = getLevel(challenge.level);
  const taskJson = challenge.task_json as Record<string, unknown>;
  const structuredBrief = (taskJson.structured_brief ?? {}) as Record<string, unknown>;

  // Build Layer 1 config
  const layer1Config: Layer1Config = {};

  const targetLang = structuredBrief.target_lang as string | undefined;
  const sellerLocale = taskJson.seller_locale as string | undefined;
  const expectedLang = targetLang ?? sellerLocale;
  if (expectedLang) layer1Config.expectedLang = expectedLang;

  const budgetTotal = structuredBrief.budget_total as number | undefined;
  if (budgetTotal != null) layer1Config.mathTotal = budgetTotal;

  const expectedCount = (structuredBrief.item_count ?? structuredBrief.prompt_count ?? structuredBrief.days) as number | undefined;
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

  const layer1 = runLayer1(primaryText, layer1Config);

  // Structural gate
  let judgeResult: JudgeResult | null = null;
  let coverageScore: number;
  let qualityScore: number;

  if (layer1.totalScore < STRUCTURAL_GATE) {
    coverageScore = 0;
    qualityScore = 0;
  } else {
    if (!process.env.XAI_API_KEY) {
      return errorResponse(
        keyHash,
        503,
        'JUDGE_UNAVAILABLE',
        'AI judge is not configured. Set XAI_API_KEY before accepting scored submissions.',
      );
    }

    const { data: rubricRow } = await supabaseAdmin
      .from('ka_variant_rubrics')
      .select('rubric_json')
      .eq('level', challenge.level)
      .eq('variant', challenge.variant ?? 'default')
      .single();

    if (!rubricRow?.rubric_json) {
      console.warn(`[submit] No rubric for level=${challenge.level} variant=${challenge.variant ?? 'default'}`);
      return errorResponse(
        keyHash,
        503,
        'RUBRIC_UNAVAILABLE',
        'Scoring rubric is missing for this challenge variant. Fix rubric data before accepting scored submissions.',
      );
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

    judgeResult = await runJudge(primaryText, rubric, briefSummary, levelDef.name, challenge.level);
    if (judgeResult.error) {
      return errorResponse(
        keyHash,
        503,
        'JUDGE_FAILED',
        'AI judge failed. Retry after fixing judge connectivity or prompt output issues.',
      );
    }

    coverageScore = judgeResult.coverageScore;
    qualityScore = judgeResult.qualityScore;
  }

  const totalScore = layer1.totalScore + coverageScore + qualityScore;
  const passed = layer1.totalScore >= STRUCTURAL_GATE && coverageScore + qualityScore >= 15;

  // ── Step 8: Save submission ──
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
      structure_score: layer1.totalScore,
      coverage_score: coverageScore,
      quality_score: qualityScore,
      total_score: totalScore,
      field_scores: layer1.checks,
      quality_subscores: judgeResult?.qualitySubscores ?? { toneFit: 0, clarity: 0, usefulness: 0, businessFit: 0 },
      flags: judgeResult?.flags ?? [],
      judge_summary: layer1.totalScore < STRUCTURAL_GATE
        ? `Structural gate failed (${layer1.totalScore}/${STRUCTURE_MAX}).`
        : (judgeResult?.summary ?? 'Judge scoring complete'),
      judge_model: judgeResult?.model ?? 'judge-unavailable',
      judge_error: judgeResult?.error ?? false,
      level: challenge.level,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Submission insert error:', insertError);
    if (insertError.code === '23505') {
      return errorResponse(keyHash, 409, 'SESSION_ALREADY_SUBMITTED',
        'This challenge session has already been submitted. Fetch a new challenge to try again.');
    }
    void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
    return NextResponse.json({ error: 'Failed to save submission', code: 'SUBMISSION_FAILED' }, { status: 500 });
  }

  // Mark session as submitted
  await supabaseAdmin
    .from('ka_challenge_sessions')
    .update({ submitted: true })
    .eq('fetch_token', fetchToken);

  // Update leaderboard
  if (participantId && passed) {
    await updateLeaderboard(participantId, challenge.level, totalScore);
    await updateMaxLevel(participantId, challenge.level);
  }

  // Build result
  const result: SubmissionResult = {
    submissionId: submission.id,
    challengeId,
    level: challenge.level,
    structureScore: layer1.totalScore,
    coverageScore,
    qualityScore,
    totalScore,
    fieldScores: layer1.checks.map((c) => ({ field: c.name, score: c.score, reason: c.reason })),
    qualitySubscores: judgeResult?.qualitySubscores ?? { toneFit: 0, clarity: 0, usefulness: 0, businessFit: 0 },
    flags: judgeResult?.flags ?? [],
    summary: layer1.totalScore < STRUCTURAL_GATE
      ? `Level ${challenge.level}: ${totalScore}/100 — STRUCTURAL GATE FAILED.`
      : judgeResult
        ? `Level ${challenge.level}: ${totalScore}/100 — ${judgeResult.summary}`
        : `Level ${challenge.level}: ${totalScore}/100`,
    passed,
    levelUnlocked: passed && challenge.level < 20 ? challenge.level + 1 : undefined,
  };

  // Cache final response (flat shape per SUBMISSION_API + INTEGRATION_GUIDE contract;
  // no outer { result } envelope — the SubmissionResult fields are the response body)
  const responseBody = result as unknown as Record<string, unknown>;
  void supabaseAdmin
    .from('ka_idempotency_keys')
    .update({ response: responseBody, status_code: 200 })
    .eq('key_hash', keyHash);

  return NextResponse.json(responseBody);

  } catch (uncaughtErr) {
    console.error('[submit] Uncaught error:', uncaughtErr);
    // Clean up pending idempotency claim to prevent deadlock
    if (typeof keyHash === 'string') {
      void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function errorResponse(keyHash: string, status: number, code: string, message: string): Promise<NextResponse> {
  const body = { error: message, code };
  if (status < 500) {
    void supabaseAdmin.from('ka_idempotency_keys').update({ response: body, status_code: status }).eq('key_hash', keyHash);
  } else {
    void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
  }
  return NextResponse.json(body, { status });
}

async function updateLeaderboard(participantId: string, level: number, score: number) {
  const { data: existing } = await supabaseAdmin.from('ka_leaderboard').select('*').eq('participant_id', participantId).single();
  const { data: user } = await supabaseAdmin.from('ka_users').select('display_name, handle, school').eq('id', participantId).single();

  if (existing) {
    const bestScores = (existing.best_scores ?? {}) as Record<string, number>;
    if (score > (bestScores[String(level)] ?? 0)) bestScores[String(level)] = score;
    const totalScore = Object.values(bestScores).reduce((a, b) => a + b, 0);
    const levelsCompleted = Object.keys(bestScores).length;
    const highestLevel = Math.max(...Object.keys(bestScores).map(Number));

    await supabaseAdmin.from('ka_leaderboard').update({
      total_score: totalScore, levels_completed: levelsCompleted, highest_level: highestLevel,
      best_scores: bestScores, tier: computeTier(highestLevel, levelsCompleted),
      display_name: user?.display_name, handle: user?.handle, school: user?.school,
      last_submission_at: new Date().toISOString(),
    }).eq('participant_id', participantId);
  } else {
    await supabaseAdmin.from('ka_leaderboard').insert({
      participant_id: participantId, display_name: user?.display_name, handle: user?.handle, school: user?.school,
      total_score: score, levels_completed: 1, highest_level: level,
      best_scores: { [String(level)]: score }, tier: computeTier(level, 1),
      last_submission_at: new Date().toISOString(),
    });
  }
}

async function updateMaxLevel(participantId: string, level: number) {
  const { data: user } = await supabaseAdmin.from('ka_users').select('max_level').eq('id', participantId).single();
  if (user && level > (user.max_level ?? 0)) {
    await supabaseAdmin.from('ka_users').update({ max_level: level }).eq('id', participantId);
  }
}

function computeTier(highestLevel: number, levelsCompleted: number): string {
  if (highestLevel >= 20 && levelsCompleted >= 18) return 'champion';
  if (highestLevel >= 15 && levelsCompleted >= 12) return 'specialist';
  if (highestLevel >= 10 && levelsCompleted >= 6) return 'builder';
  return 'starter';
}
