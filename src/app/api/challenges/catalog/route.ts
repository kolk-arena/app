/**
 * GET /api/challenges/catalog — Public level catalog
 *
 * Static, agent-friendly enumeration of every level currently published in
 * the public beta. Covers what an agent needs before fetching its first
 * challenge: which levels exist, which require auth, which are AI-judged,
 * which feed the leaderboard, and the suggested time budget for each.
 *
 * Does not consume challenge quota and is safe to poll. Cached aggressively
 * because the catalog only changes when the level set or beta contract does.
 */

import { NextResponse } from 'next/server';
import { LEVEL_DEFINITIONS } from '@/lib/kolk/levels';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  PUBLIC_BETA_MAX_LEVEL,
  PUBLIC_BETA_MIN_LEVEL,
  RANKED_BETA_MAX_LEVEL,
  RANKED_BETA_MIN_LEVEL,
  getSuggestedTimeMinutes,
  isAiJudgedLevel,
  isRankedBetaLevel,
} from '@/lib/kolk/beta-contract';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function GET() {
  const levels = LEVEL_DEFINITIONS.map((definition) => {
    const level = definition.level;
    const requiresAuth = level > ANONYMOUS_BETA_MAX_LEVEL;
    return {
      level,
      name: definition.name,
      family: definition.family,
      band: definition.band,
      isBoss: definition.isBoss,
      bossSpecial: definition.bossSpecial ?? null,
      passThreshold: definition.passThreshold,
      timeLimitMinutes: definition.timeLimitMinutes,
      suggestedTimeMinutes: getSuggestedTimeMinutes(level),
      coverageTargets: definition.coverageTargets,
      aiJudged: isAiJudgedLevel(level),
      leaderboardEligible: isRankedBetaLevel(level),
      requiresAuth,
      identityMode: requiresAuth ? 'bearer_token' : 'browser_session_cookie',
    };
  });

  return NextResponse.json(
    {
      publicBeta: {
        minLevel: PUBLIC_BETA_MIN_LEVEL,
        maxLevel: PUBLIC_BETA_MAX_LEVEL,
        rankedMinLevel: RANKED_BETA_MIN_LEVEL,
        rankedMaxLevel: RANKED_BETA_MAX_LEVEL,
        anonymousMaxLevel: ANONYMOUS_BETA_MAX_LEVEL,
        authRequiredFromLevel: ANONYMOUS_BETA_MAX_LEVEL + 1,
      },
      levels,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
