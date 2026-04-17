/**
 * GET /api/challenge/:level — Fetch a challenge package
 *
 * Flow:
 * 1. Validate level (current dynamic route handles 1-20; public beta publishes L1-L8 here)
 * 2. Check level gating (must pass N-1 to attempt N; anon for L1-L5)
 * 3. Pick a random challenge NOT already submitted by this user
 * 4. Create a ka_challenge_sessions row (server-side start time + fetch nonce)
 * 5. Return challenge package with fetchToken (required on submit)
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { assertRuntimeSchemaReady, supabaseAdmin } from '@/lib/kolk/db';
import { getLevel, isBossLevel } from '@/lib/kolk/levels';
import { getAnonToken } from '@/lib/kolk/auth';
import { resolveArenaUserFromRequest } from '@/lib/kolk/auth/server';
import { ANONYMOUS_MAX_LEVEL } from '@/lib/kolk/constants';
import type { ChallengePackage } from '@/lib/kolk/types';

const HARD_SESSION_CEILING_MINUTES = 1440;

function getSuggestedTimeMinutes(level: number): number {
  switch (level) {
    case 1:
      return 5;
    case 2:
      return 8;
    case 3:
      return 10;
    case 4:
      return 12;
    case 5:
      return 15;
    case 6:
      return 20;
    case 7:
      return 25;
    case 8:
      return 30;
    default:
      return 5;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> },
) {
  try {
    await assertRuntimeSchemaReady();
  } catch (error) {
    console.error('[challenge/fetch] Runtime schema check failed:', error);
    return NextResponse.json(
      { error: 'Challenge service is not ready. Apply the latest database migrations.', code: 'SCHEMA_NOT_READY' },
      { status: 503 },
    );
  }

  const { level: levelStr } = await params;
  const level = parseInt(levelStr, 10);

  // 1. Validate level
  if (isNaN(level) || level < 1 || level > 20) {
    return NextResponse.json(
      { error: 'Level must be between 1 and 20', code: 'INVALID_LEVEL' },
      { status: 400 },
    );
  }

  if (level > 8) {
    return NextResponse.json(
      {
        error: `Level ${level} is not in the current public beta scope (L0-L8)`,
        code: 'FEATURE_NOT_PUBLIC',
        requested_level: level,
        allowed_range: '0-8',
      },
      { status: 403 },
    );
  }

  const levelDef = getLevel(level);

  // 2. Resolve identity
  let participantId: string | null = null;
  let anonToken: string | null = null;
  let maxLevelPassed = 0;

  const arenaUser = await resolveArenaUserFromRequest(request);

  if (arenaUser?.is_verified) {
    participantId = arenaUser.id;
    maxLevelPassed = arenaUser.max_level;
  } else if (level > ANONYMOUS_MAX_LEVEL) {
    return NextResponse.json(
      {
        error: `Authentication required for level ${level}. Pass L1-L5 first, then sign in with GitHub, Google, or email.`,
        code: 'AUTH_REQUIRED',
      },
      { status: 401 },
    );
  } else {
    // Anonymous: check anon tracking for L1-L5
    anonToken = getAnonToken(request);
    const { data: anonSubs } = await supabaseAdmin
      .from('ka_submissions')
      .select('level, unlocked, structure_score, coverage_score, quality_score, total_score')
      .eq('anon_token', anonToken)
      .order('level', { ascending: false })
      .limit(20);

    if (anonSubs) {
      for (const sub of anonSubs) {
        const structureScore = typeof sub.structure_score === 'number' ? sub.structure_score : Number(sub.structure_score ?? 0);
        const coverageScore = typeof sub.coverage_score === 'number' ? sub.coverage_score : Number(sub.coverage_score ?? 0);
        const qualityScore = typeof sub.quality_score === 'number' ? sub.quality_score : Number(sub.quality_score ?? 0);
        const unlocked = sub.unlocked === true
          || (Number.isFinite(structureScore) && Number.isFinite(coverageScore) && Number.isFinite(qualityScore)
            && structureScore >= 25
            && coverageScore + qualityScore >= 15);
        if (unlocked && sub.level > maxLevelPassed) {
          maxLevelPassed = sub.level;
        }
      }
    }
  }

  // Gate check: must have passed level-1 (L1 is always accessible)
  if (level > 1 && maxLevelPassed < level - 1) {
    return NextResponse.json(
      {
        error: `Must pass level ${level - 1} before attempting level ${level}`,
        code: 'LEVEL_LOCKED',
        highest_passed: maxLevelPassed,
        next_level: maxLevelPassed + 1,
      },
      { status: 403 },
    );
  }

  // 3. Pick a challenge NOT already submitted by this user
  // First, get IDs of challenges this user already submitted to
  const submittedFilter = supabaseAdmin
    .from('ka_submissions')
    .select('challenge_id');

  if (participantId) {
    submittedFilter.eq('participant_id', participantId);
  } else if (anonToken) {
    submittedFilter.eq('anon_token', anonToken);
  }

  const { data: submittedRows } = await submittedFilter;
  const submittedIds = new Set((submittedRows ?? []).map((r) => r.challenge_id));

  // Fetch all active challenges for this level
  const { data: allChallenges, error: fetchError } = await supabaseAdmin
    .from('ka_challenges')
    .select('*')
    .eq('level', level)
    .eq('active', true);

  if (fetchError || !allChallenges || allChallenges.length === 0) {
    return NextResponse.json(
      { error: `No challenges available for level ${level}`, code: 'NO_CHALLENGES' },
      { status: 503 },
    );
  }

  // Filter out already-submitted challenges
  const available = allChallenges.filter((c) => !submittedIds.has(c.id));

  if (available.length === 0) {
    // All challenges exhausted — allow replaying any (re-attempts still scored)
    // Pick from full pool but warn
    const challenge = allChallenges[Math.floor(Math.random() * allChallenges.length)];
    return buildSessionAndRespond(challenge, levelDef, level, participantId, anonToken, true);
  }

  // Random selection from available pool
  const challenge = available[Math.floor(Math.random() * available.length)];
  return buildSessionAndRespond(challenge, levelDef, level, participantId, anonToken, false);
}

// ============================================================================
// Helper: create session + build response
// ============================================================================

async function buildSessionAndRespond(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  challenge: any,
  levelDef: ReturnType<typeof getLevel>,
  level: number,
  participantId: string | null,
  anonToken: string | null,
  isReplay: boolean,
) {
  const startedAt = new Date();
  const suggestedTimeMinutes = getSuggestedTimeMinutes(level);
  const deadlineUtc = new Date(
    startedAt.getTime() + HARD_SESSION_CEILING_MINUTES * 60 * 1000,
  );

  // Generate fetch nonce
  const fetchToken = crypto.randomBytes(24).toString('base64url');

  // 4. Persist session (server-side source of truth for deadline)
  const { error: sessionError } = await supabaseAdmin
    .from('ka_challenge_sessions')
    .insert({
      challenge_id: challenge.id,
      participant_id: participantId,
      anon_token: anonToken,
      fetch_token: fetchToken,
      started_at: startedAt.toISOString(),
      deadline_utc: deadlineUtc.toISOString(),
    });

  if (sessionError) {
    console.error('[challenge/fetch] Session insert error:', sessionError);
    return NextResponse.json(
      { error: 'Failed to create challenge session', code: 'SESSION_ERROR' },
      { status: 500 },
    );
  }

  // 5. Build response
  const pkg: ChallengePackage = {
    challengeId: challenge.id,
    level: challenge.level,
    seed: challenge.seed,
    variant: challenge.variant,
    fetchToken,
    taskJson: challenge.task_json,
    promptMd: challenge.prompt_md,
    suggestedTimeMinutes,
    timeLimitMinutes: HARD_SESSION_CEILING_MINUTES,
    deadlineUtc: deadlineUtc.toISOString(),
    challengeStartedAt: startedAt.toISOString(),
  };

  const response: Record<string, unknown> = {
    challenge: pkg,
    level_info: {
      name: levelDef.name,
      family: levelDef.family,
      band: levelDef.band,
      suggested_time_minutes: suggestedTimeMinutes,
      pass_threshold: levelDef.passThreshold,
      is_boss: levelDef.isBoss,
    },
  };

  if (isBossLevel(level)) {
    response.boss_hint = 'This is a boss level. Watch for traps in the brief.';
  }

  if (isReplay) {
    response.replay_warning = 'All fresh challenges for this level have been used. This is a replay.';
  }

  return NextResponse.json(response);
}
