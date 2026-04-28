/**
 * GET /api/challenge/:level — Fetch a challenge package
 *
 * Flow:
 * 1. Validate level (public beta publishes the current level set here)
 * 2. Check level gating (must unlock N-1 to attempt N; anon for L0-L5)
 * 3. Pick a random challenge NOT already submitted by this user
 * 4. Create a ka_challenge_sessions row (server-side start time + fetch nonce)
 * 5. Return challenge package with attemptToken (required on submit; 24h retry-until-pass capability)
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { assertRuntimeSchemaReady, supabaseAdmin } from '@/lib/kolk/db';
import { getLevel, isBossLevel } from '@/lib/kolk/levels';
import { applyAnonTokenCookie, resolveAnonToken } from '@/lib/kolk/auth';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { missingScopes, SCOPES } from '@/lib/kolk/tokens';
import type { ChallengePackage } from '@/lib/kolk/types';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  PUBLIC_BETA_MAX_LEVEL,
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

  if (!Number.isFinite(level) || level < 0 || level > PUBLIC_BETA_MAX_LEVEL) {
    return NextResponse.json(
      { error: 'Requested level is not published yet.', code: 'INVALID_LEVEL' },
      { status: 400 },
    );
  }

  if (!isPublicBetaLevel(level)) {
    return NextResponse.json(
      {
        error: 'This level is not available in the current public beta.',
        code: 'LEVEL_NOT_AVAILABLE',
      },
      { status: 404 },
    );
  }

  const levelDef = getLevel(level);

  let participantId: string | null = null;
  let anonToken: string | null = null;
  let shouldSetAnonCookie = false;
  let maxLevelPassed = 0;

  const arenaAuth = await resolveArenaAuthContext(request);
  const arenaUser = arenaAuth?.user;

  // Scope enforcement (PAT-authenticated callers only).
  // See docs/API_TOKENS.md §Scopes.
  if (arenaAuth?.scopes !== null && arenaAuth?.scopes !== undefined) {
    const missing = missingScopes(arenaAuth.scopes, [SCOPES.FETCH_CHALLENGE]);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `This Personal Access Token is missing the ${missing.join(', ')} scope required to fetch a challenge.`,
          code: 'INSUFFICIENT_SCOPE',
          missing_scopes: missing,
        },
        { status: 403 },
      );
    }
  }

  if (arenaUser?.is_verified) {
    participantId = arenaUser.id;
    maxLevelPassed = arenaUser.max_level;
  } else if (level > ANONYMOUS_BETA_MAX_LEVEL) {
    return NextResponse.json(
      {
        error: `Authentication required for level ${level}. Pass L1-L5 first, then sign in to continue.`,
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

  const replayAvailable = maxLevelPassed >= 8;
  const passedThisLevel = level > 0 && maxLevelPassed >= level;

  if (passedThisLevel && !replayAvailable) {
    return NextResponse.json(
      {
        error: "You've already passed this level. Advance further to unlock replay mode.",
        code: 'LEVEL_ALREADY_PASSED',
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
    replayAvailable,
    replayAvailable && passedThisLevel,
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
  replayAvailable: boolean,
  isReplay: boolean,
) {
  const startedAt = new Date();
  const suggestedTimeMinutes = getSuggestedTimeMinutes(level);
  const deadlineUtc = new Date(
    startedAt.getTime() + HARD_SESSION_CEILING_MINUTES * 60 * 1000,
  );

  const attemptToken = crypto.randomBytes(24).toString('base64url');

  const { error: sessionError } = await supabaseAdmin
    .from('ka_challenge_sessions')
    .insert({
      challenge_id: challenge.id,
      participant_id: participantId,
      anon_token: anonToken,
      attempt_token: attemptToken,
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
    attemptToken,
    // Legacy alias for one minor release; new integrations must use attemptToken.
    fetchToken: attemptToken,
    taskJson: challenge.task_json,
    promptMd: challenge.prompt_md,
    suggestedTimeMinutes,
    timeLimitMinutes: HARD_SESSION_CEILING_MINUTES,
    deadlineUtc: deadlineUtc.toISOString(),
    challengeStartedAt: startedAt.toISOString(),
  };

  const response: Record<string, unknown> = {
    challenge: pkg,
    serverNowUtc: startedAt.toISOString(),
    level_info: {
      name: levelDef.name,
      family: levelDef.family,
      band: levelDef.band,
      unlock_rule: level === L0_ONBOARDING_LEVEL ? 'contains_hello_or_kolk' : 'dual_gate',
      suggested_time_minutes: suggestedTimeMinutes,
      is_boss: levelDef.isBoss,
      ai_judged: isAiJudgedLevel(level),
      leaderboard_eligible: level >= 1,
    },
    replayAvailable,
  };

  if (isBossLevel(level)) {
    response.boss_hint = 'This level includes special constraints. Watch for traps in the brief.';
  }

  if (isReplay) {
    response.replay = true;
    response.replay_warning = 'Replay mode active. Only a higher score will replace your current best score on this level.';
  }

  return NextResponse.json(response);
}
