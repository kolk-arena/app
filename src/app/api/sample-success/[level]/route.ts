import { NextRequest, NextResponse } from 'next/server';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import { getAgentLevelContract, getSampleSuccess } from '@/lib/kolk/agent-contract';

export const dynamic = 'force-static';
export const revalidate = 3600;

export function generateStaticParams() {
  return [{ level: '3' }, { level: '5' }];
}

function parseLevel(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && String(parsed) === value ? parsed : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ level: string }> },
) {
  const { level: rawLevel } = await params;
  const level = parseLevel(rawLevel);

  if (level == null) {
    return NextResponse.json(
      { error: 'Invalid level', code: 'INVALID_LEVEL' },
      { status: 400 },
    );
  }

  const sample = getSampleSuccess(level);
  const contract = getAgentLevelContract(level);

  if (!sample || !contract) {
    return NextResponse.json(
      {
        error: `No sample success is published for level ${level}`,
        code: 'SAMPLE_NOT_AVAILABLE',
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      kind: 'kolk_sample_success',
      synthetic: true,
      leaderboardEligible: false,
      level,
      title: sample.title,
      description: sample.description,
      primaryText: sample.primaryText,
      outputContract: contract.outputContract,
      deterministicChecks: contract.deterministicChecks,
      factSourceKeys: contract.factSourceKeys ?? [],
      commonFailureModes: contract.commonFailureModes,
      submitEndpoint: `${APP_CONFIG.canonicalOrigin}/api/challenge/submit`,
      note: 'This is a synthetic shape example for calibration only. Replace all business details with the live fetched challenge before submitting.',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}
