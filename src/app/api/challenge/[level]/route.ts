/**
 * GET /api/challenge/:level — Fetch a challenge package
 *
 * Flow:
 * 1. Validate level (public beta publishes L0-L8 here)
 * 2. Check level gating (must unlock N-1 to attempt N; anon for L0-L5)
 * 3. Pick a random challenge NOT already submitted by this user
 * 4. Create a ka_challenge_sessions row (server-side start time + fetch nonce)
 * 5. Return challenge package with fetchToken (required on submit)
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { assertRuntimeSchemaReady, supabaseAdmin } from '@/lib/kolk/db';
import { getLevel, isBossLevel } from '@/lib/kolk/levels';
import { applyAnonTokenCookie, resolveAnonToken } from '@/lib/kolk/auth';
import { resolveArenaUserFromRequest } from '@/lib/kolk/auth/server';
import type { ChallengePackage } from '@/lib/kolk/types';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  getSuggestedTimeMinutes,
  isAiJudgedLevel,
  isPublicBetaLevel,
  L0_ONBOARDING_LEVEL,
} from '@/lib/kolk/beta-contract';
import { getAnonymousMaxUnlockedLevel } from '@/lib/kolk/progression';

const HARD_SESSION_CEILING_MINUTES = 1440;

type ChallengeRow = {
  id: string;
  level: number;
  seed: number;
  variant: string;
  task_json: Record<string, unknown>;
  prompt_md: string;
};

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
  const level = Number.parseInt(levelStr, 10);

  if (!Number.isFinite(level) || level < 0 || level > 20) {
    return NextResponse.json(
      { error: 'Level must be between 0 and 20', code: 'INVALID_LEVEL' },
      { status: 400 },
    );
  }

  if (!isPublicBetaLevel(level)) {
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

  let participantId: string | null = null;
  let anonToken: string | null = null;
  let shouldSetAnonCookie = false;
  let maxLevelPassed = 0;

  const arenaUser = await resolveArenaUserFromRequest(request);

  if (arenaUser?.is_verified) {
    participantId = arenaUser.id;
    maxLevelPassed = arenaUser.max_level;
  } else if (level > ANONYMOUS_BETA_MAX_LEVEL) {
    return NextResponse.json(
      {
        error: `Authentication required for level ${level}. Pass L1-L5 first, then sign in with GitHub, Google, or email.`,
        code: 'AUTH_REQUIRED',
      },
      { status: 401 },
    );
  } else {
    const anonState = resolveAnonToken(request);
    anonToken = anonState.token;
    shouldSetAnonCookie = anonState.shouldSetCookie;
    maxLevelPassed = await getAnonymousMaxUnlockedLevel(anonToken);
  }

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

  const submittedFilter = supabaseAdmin
    .from('ka_submissions')
    .select('challenge_id');

  if (participantId) {
    submittedFilter.eq('participant_id', participantId);
  } else if (anonToken) {
    submittedFilter.eq('anon_token', anonToken);
  }

  const { data: submittedRows } = await submittedFilter;
  const submittedIds = new Set((submittedRows ?? []).map((row) => row.challenge_id));

  const { data: allChallenges, error: fetchError } = await supabaseAdmin
    .from('ka_challenges')
    .select('id, level, seed, variant, task_json, prompt_md')
    .eq('level', level)
    .eq('active', true);

  if (fetchError || !allChallenges || allChallenges.length === 0) {
    return NextResponse.json(
      { error: `No challenges available for level ${level}`, code: 'NO_CHALLENGES' },
      { status: 503 },
    );
  }

  const available = (allChallenges as ChallengeRow[]).filter((challenge) => !submittedIds.has(challenge.id));
  const challengePool = available.length > 0 ? available : (allChallenges as ChallengeRow[]);
  const challenge = challengePool[Math.floor(Math.random() * challengePool.length)];

  const response = await buildSessionAndRespond(
    challenge,
    levelDef,
    level,
    participantId,
    anonToken,
    available.length === 0,
  );

  if (anonToken && shouldSetAnonCookie) {
    applyAnonTokenCookie(response, anonToken);
  }

  return response;
}

async function buildSessionAndRespond(
  challenge: ChallengeRow,
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

  const fetchToken = crypto.randomBytes(24).toString('base64url');

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
      unlock_rule: level === L0_ONBOARDING_LEVEL ? 'contains_hello_or_kolk' : 'dual_gate',
      suggested_time_minutes: suggestedTimeMinutes,
      is_boss: levelDef.isBoss,
      ai_judged: isAiJudgedLevel(level),
      leaderboard_eligible: level >= 1 && participantId !== null,
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
