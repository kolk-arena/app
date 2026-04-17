/**
 * POST /api/challenge/submit — Submit a solution for scoring
 *
 * Session-bound flow:
 * 1. Idempotency-Key header required
 * 2. Check idempotency cache
 * 3. Parse body (requires fetchToken from challenge fetch)
 * 4. Validate session: fetchToken -> ka_challenge_sessions row
 * 5. Enforce deadline from server-side session (not client-provided)
 * 6. Check not already submitted for this session
 * 7. Run scoring (L0 deterministic check or Layer 1 -> AI judge)
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
import { MAX_PRIMARY_TEXT_CHARS, STRUCTURE_MAX } from '@/lib/kolk/constants';
import type { VariantRubric } from '@/lib/kolk/types';
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
  SUBMIT_RATE_LIMIT_MAX,
  SUBMIT_RATE_LIMIT_WINDOW_MS,
} from '@/lib/kolk/beta-contract';

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) ?? []).filter((timestamp) => now - timestamp < SUBMIT_RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= SUBMIT_RATE_LIMIT_MAX) {
    const oldestTs = timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((SUBMIT_RATE_LIMIT_WINDOW_MS - (now - oldestTs)) / 1000));
    rateLimitMap.set(key, timestamps);
    return { allowed: false as const, retryAfterSeconds };
  }

  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return { allowed: true as const, retryAfterSeconds: 0 };
}

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
  headers?: HeadersInit;
};

async function errorResponse({
  keyHash,
  status,
  code,
  message,
  headers,
}: ErrorResponseInit): Promise<NextResponse> {
  const body = { error: message, code };

  if (status < 500) {
    void supabaseAdmin
      .from('ka_idempotency_keys')
      .update({ response: body, status_code: status })
      .eq('key_hash', keyHash);
  } else {
    void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
  }

  return NextResponse.json(body, {
    status,
    headers,
  });
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
}) {
  const { participantId, level, score } = input;

  const [{ data: existing }, { data: user }] = await Promise.all([
    supabaseAdmin.from('ka_leaderboard').select('*').eq('participant_id', participantId).single(),
    supabaseAdmin
      .from('ka_users')
      .select('display_name, handle, framework, school')
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

  const payload = {
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
    framework: user?.framework ?? null,
    school: user?.school ?? null,
    last_submission_at: bestRun?.submitted_at ?? new Date().toISOString(),
  };

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

async function updateMaxLevel(participantId: string, level: number) {
  const { data: user } = await supabaseAdmin
    .from('ka_users')
    .select('max_level')
    .eq('id', participantId)
    .single();

  if (user && level > (user.max_level ?? 0)) {
    await supabaseAdmin
      .from('ka_users')
      .update({ max_level: level })
      .eq('id', participantId);
  }
}

function computeTier(highestLevel: number, levelsCompleted: number): string {
  if (highestLevel >= 8 && levelsCompleted >= 8) return 'builder';
  if (highestLevel >= 6 && levelsCompleted >= 6) return 'builder';
  return 'starter';
}

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

    const { error: claimError } = await supabaseAdmin
      .from('ka_idempotency_keys')
      .insert({ key_hash: keyHash, response: { status: 'pending' }, status_code: 202 });

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
      });
    }

    const parsed = SubmissionInputSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        keyHash,
        status: 400,
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Validation failed',
      });
    }

    const { fetchToken, primaryText, repoUrl, commitHash } = parsed.data;

    if (primaryText.length > MAX_PRIMARY_TEXT_CHARS) {
      return errorResponse({
        keyHash,
        status: 422,
        code: 'TEXT_TOO_LONG',
        message: `primaryText exceeds ${MAX_PRIMARY_TEXT_CHARS} character limit`,
      });
    }

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('ka_challenge_sessions')
      .select('*')
      .eq('fetch_token', fetchToken)
      .single();

    if (sessionErr || !session) {
      return errorResponse({
        keyHash,
        status: 404,
        code: 'INVALID_FETCH_TOKEN',
        message: 'fetchToken not found. You must call GET /api/challenge/:level first and use the returned fetchToken.',
      });
    }

    if (session.submitted) {
      return errorResponse({
        keyHash,
        status: 409,
        code: 'SESSION_ALREADY_SUBMITTED',
        message: 'This challenge session has already been submitted. Fetch a new challenge to try again.',
      });
    }

    const challengeId = session.challenge_id as string;
    const sessionParticipantId = session.participant_id as string | null;
    const sessionAnonToken = session.anon_token as string | null;

    let callerParticipantId: string | null = null;
    let callerAnonToken: string | null = null;

    const arenaUser = await resolveArenaUserFromRequest(request);
    if (arenaUser?.is_verified) {
      callerParticipantId = arenaUser.id;
    } else {
      callerAnonToken = getAnonToken(request);
    }

    if (sessionParticipantId) {
      if (callerParticipantId !== sessionParticipantId) {
        return errorResponse({
          keyHash,
          status: 403,
          code: 'IDENTITY_MISMATCH',
          message: 'This fetchToken belongs to a different user. You cannot submit on behalf of another account.',
        });
      }
    } else if (sessionAnonToken) {
      if (callerAnonToken !== sessionAnonToken) {
        return errorResponse({
          keyHash,
          status: 403,
          code: 'IDENTITY_MISMATCH',
          message: 'This fetchToken belongs to a different anonymous session.',
        });
      }
    }

    const participantId = sessionParticipantId;
    const anonToken = sessionAnonToken;

    const now = new Date();
    const deadlineUtc = new Date(session.deadline_utc as string);
    const challengeStartedAt = new Date(session.started_at as string);

    if (now > deadlineUtc) {
      return errorResponse({
        keyHash,
        status: 408,
        code: 'SESSION_EXPIRED',
        message: `The 24-hour session window has passed. Fetch a new challenge and retry.`,
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
      });
    }

    if (!participantId && challenge.level > ANONYMOUS_BETA_MAX_LEVEL) {
      return errorResponse({
        keyHash,
        status: 401,
        code: 'AUTH_REQUIRED',
        message: `Authentication required for level ${challenge.level}`,
      });
    }

    const rateLimitKey = participantId ?? anonToken ?? 'unknown';
    const rateLimit = checkRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return errorResponse({
        keyHash,
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds),
        },
      });
    }

    if (challenge.level === 5) {
      const l5Json = parseL5Json(primaryText);
      if (!l5Json.ok) {
        return errorResponse({
          keyHash,
          status: 422,
          code: 'L5_INVALID_JSON',
          message: l5Json.message,
          headers: l5Json.parserPosition
            ? {
                'X-Parser-Position': l5Json.parserPosition,
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
    let judgeModel = aiJudged ? 'judge-unavailable' : 'deterministic-l0';
    let judgeResult: JudgeResult | null = null;

    if (challenge.level === 0) {
      const passed = /hello|kolk/i.test(primaryText);
      if (!passed) {
        return errorResponse({
          keyHash,
          status: 400,
          code: 'VALIDATION_ERROR',
          message: "L0 submission must contain 'Hello' or 'Kolk' (case-insensitive).",
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
      structureScore = layer1.totalScore;
      fieldScores = layer1.checks.map((check) => ({
        field: check.name,
        score: check.score,
        reason: check.reason,
      }));

      if (structureScore >= 25) {
        if (!process.env.XAI_API_KEY) {
          return errorResponse({
            keyHash,
            status: 503,
            code: 'SCORING_UNAVAILABLE',
            message: 'Scoring is temporarily unavailable. Please try again shortly.',
          });
        }

        const { data: rubricRow } = await supabaseAdmin
          .from('ka_variant_rubrics')
          .select('rubric_json')
          .eq('level', challenge.level)
          .eq('variant', challenge.variant ?? 'default')
          .single();

        if (!rubricRow?.rubric_json) {
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

        judgeResult = await runJudge(primaryText, rubric, briefSummary, levelDef.name, challenge.level);
        if (judgeResult.error) {
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
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Submission insert error:', insertError);
      if (insertError.code === '23505') {
        return errorResponse({
          keyHash,
          status: 409,
          code: 'SESSION_ALREADY_SUBMITTED',
          message: 'This challenge session has already been submitted. Fetch a new challenge to try again.',
        });
      }

      void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
      return NextResponse.json(
        { error: 'Failed to save submission', code: 'SUBMISSION_FAILED' },
        { status: 500 },
      );
    }

    await supabaseAdmin
      .from('ka_challenge_sessions')
      .update({ submitted: true })
      .eq('fetch_token', fetchToken);

    if (leaderboardEligible && participantId) {
      await updateLeaderboard({
        participantId,
        level: challenge.level,
        score: totalScore,
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
    void supabaseAdmin
      .from('ka_idempotency_keys')
      .update({ response: responseBody, status_code: 200 })
      .eq('key_hash', keyHash);

    return NextResponse.json(responseBody);
  } catch (uncaughtErr) {
    console.error('[submit] Uncaught error:', uncaughtErr);
    if (typeof keyHash === 'string') {
      void supabaseAdmin.from('ka_idempotency_keys').delete().eq('key_hash', keyHash);
    }
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
