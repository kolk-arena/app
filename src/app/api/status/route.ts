import { NextResponse } from 'next/server';
import { assertRuntimeSchemaReady } from '@/lib/kolk/db';
import { getAiReadinessSummary } from '@/lib/kolk/ai';
import {
  ANONYMOUS_BETA_MAX_LEVEL,
  PUBLIC_BETA_MAX_LEVEL,
  PUBLIC_BETA_MIN_LEVEL,
  RANKED_BETA_MAX_LEVEL,
  RANKED_BETA_MIN_LEVEL,
} from '@/lib/kolk/beta-contract';

export async function GET() {
  const serverNowUtc = new Date().toISOString();

  try {
    await assertRuntimeSchemaReady();
  } catch (error) {
    console.error('[status] Runtime schema check failed:', error);
    return NextResponse.json(
      {
        status: 'degraded',
        code: 'SCHEMA_NOT_READY',
        serverNowUtc,
        checks: {
          database: 'unavailable',
          challengeFetch: 'unavailable',
          submit: 'unavailable',
        },
      },
      { status: 503 },
    );
  }

  const aiReadiness = getAiReadinessSummary();

  return NextResponse.json({
    status: 'ok',
    serverNowUtc,
    publicBeta: {
      minLevel: PUBLIC_BETA_MIN_LEVEL,
      maxLevel: PUBLIC_BETA_MAX_LEVEL,
      rankedMinLevel: RANKED_BETA_MIN_LEVEL,
      rankedMaxLevel: RANKED_BETA_MAX_LEVEL,
      anonymousMaxLevel: ANONYMOUS_BETA_MAX_LEVEL,
      authRequiredFromLevel: ANONYMOUS_BETA_MAX_LEVEL + 1,
    },
    checks: {
      database: 'ok',
      challengeFetch: 'ok',
      submit: 'ok',
      scoring: aiReadiness.scoringReady ? 'ready' : 'unavailable',
    },
    scoring: {
      ready: aiReadiness.scoringReady,
      availableCombos: aiReadiness.availableScoringCombos,
      preferredCombo: aiReadiness.preferredScoringCombo,
    },
  });
}

