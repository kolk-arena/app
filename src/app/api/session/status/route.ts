import { NextRequest, NextResponse } from 'next/server';
import { assertRuntimeSchemaReady } from '@/lib/kolk/db';
import { applyAnonTokenCookie, resolveAnonToken } from '@/lib/kolk/auth';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { getAnonymousMaxUnlockedLevel } from '@/lib/kolk/progression';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  PUBLIC_BETA_MIN_LEVEL,
  RANKED_BETA_MAX_LEVEL,
  RANKED_BETA_MIN_LEVEL,
  isPublicBetaLevel,
} from '@/lib/kolk/beta-contract';

function nextLevelFor(maxLevel: number) {
  const candidate = maxLevel + 1;
  return isPublicBetaLevel(candidate) ? candidate : undefined;
}

function progressFields(highestPassed: number) {
  const nextLevel = nextLevelFor(highestPassed);
  return {
    highest_passed: highestPassed,
    ...(typeof nextLevel === 'number'
      ? { next_level: nextLevel, next_action: 'fetch_next_level' as const }
      : { next_action: 'check_catalog_or_replay' as const }),
    replay_available: highestPassed >= RANKED_BETA_MAX_LEVEL,
  };
}

export async function GET(request: NextRequest) {
  try {
    await assertRuntimeSchemaReady();
  } catch (error) {
    console.error('[session/status] Runtime schema check failed:', error);
    return NextResponse.json(
      { error: 'Session service is not ready. Apply the latest database migrations.', code: 'SCHEMA_NOT_READY' },
      { status: 503 },
    );
  }

  const arenaAuth = await resolveArenaAuthContext(request);
  const user = arenaAuth?.user;

  if (arenaAuth && user?.is_verified) {
    const highestPassed = Math.max(0, Math.trunc(user.max_level ?? 0));
    return NextResponse.json({
      status: 'signed_in',
      identity: {
        mode: arenaAuth.scopes === null ? 'browser_session' : 'bearer_token',
        display_name: user.display_name,
        handle: user.handle,
        is_verified: true,
      },
      ...progressFields(highestPassed),
      levels: {
        min: PUBLIC_BETA_MIN_LEVEL,
        ranked_min: RANKED_BETA_MIN_LEVEL,
        anonymous_max: ANONYMOUS_BETA_MAX_LEVEL,
        auth_required_from: ANONYMOUS_BETA_MAX_LEVEL + 1,
        competitive_tier: 'L6+',
        catalog_is_authoritative: true,
      },
    });
  }

  const anonState = resolveAnonToken(request);
  const highestPassed = await getAnonymousMaxUnlockedLevel(anonState.token);
  const response = NextResponse.json({
    status: 'anonymous',
    identity: {
      mode: 'anonymous_cookie',
      same_session_required: true,
    },
    ...progressFields(highestPassed),
    levels: {
      min: PUBLIC_BETA_MIN_LEVEL,
      ranked_min: RANKED_BETA_MIN_LEVEL,
      anonymous_max: ANONYMOUS_BETA_MAX_LEVEL,
      auth_required_from: ANONYMOUS_BETA_MAX_LEVEL + 1,
      competitive_tier: 'L6+',
      catalog_is_authoritative: true,
    },
  });

  if (anonState.shouldSetCookie) {
    applyAnonTokenCookie(response, anonState.token);
  }

  return response;
}
