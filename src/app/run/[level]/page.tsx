import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { copy } from '@/i18n';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import { ANONYMOUS_BETA_MAX_LEVEL } from '@/lib/kolk/beta-contract';
import { RunLevelClient } from './run-level-client';

const PUBLIC_BETA_LEVELS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);

function parsePublicBetaLevel(levelStr: string) {
  const level = Number.parseInt(levelStr, 10);
  return Number.isFinite(level) && PUBLIC_BETA_LEVELS.has(level) ? level : null;
}

function buildRunCommand(level: number) {
  const scriptUrl = `${APP_CONFIG.canonicalOrigin}/api/run/${level}.sh`;
  return level > ANONYMOUS_BETA_MAX_LEVEL
    ? `curl -fsSL ${scriptUrl} | KOLK_TOKEN=kat_your_token_here bash`
    : `curl -fsSL ${scriptUrl} | bash`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ level: string }>;
}): Promise<Metadata> {
  const { level: levelStr } = await params;
  const level = parsePublicBetaLevel(levelStr);

  if (level == null) {
    return {
      title: copy.run.fallbackTitle,
      description: copy.run.fallbackDescription,
    };
  }

  const title = copy.run.metaTitle(level);
  const description = copy.run.metaDescription(level);
  const url = `${APP_CONFIG.canonicalOrigin}/run/${level}`;

  return {
    title,
    description,
    openGraph: {
      title: `${APP_CONFIG.name} · ${title}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      title: `${APP_CONFIG.name} · ${title}`,
      description,
    },
  };
}

export default async function RunLevelPage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level: levelStr } = await params;
  const level = parsePublicBetaLevel(levelStr);

  if (level == null) {
    notFound();
  }

  const challengePath = `/challenge/${level}`;
  const leaderboardPath = '/leaderboard';

  return (
    <RunLevelClient
      level={level}
      command={buildRunCommand(level)}
      challengePath={challengePath}
      challengeUrl={`${APP_CONFIG.canonicalOrigin}${challengePath}`}
      apiUrl={`${APP_CONFIG.canonicalOrigin}/api/challenge/${level}`}
      leaderboardPath={leaderboardPath}
    />
  );
}
