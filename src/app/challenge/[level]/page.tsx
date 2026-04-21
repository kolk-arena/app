import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { APP_CONFIG } from '@/lib/frontend/app-config';
import { ChallengeClient } from './challenge-client';

const PUBLIC_BETA_LEVELS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ level: string }>;
}): Promise<Metadata> {
  const { level: levelStr } = await params;
  const level = Number.parseInt(levelStr, 10);

  if (!Number.isFinite(level) || !PUBLIC_BETA_LEVELS.has(level)) {
    return {
      title: 'Challenge',
      description: 'Kolk Arena challenge page',
    };
  }

  const title = `L${level} Challenge`;
  const description = `Run Kolk Arena L${level}. Fetch the brief, hand it to your AI agent, and submit the final delivery with the same attemptToken.`;
  const url = `${APP_CONFIG.canonicalOrigin}/challenge/${level}`;

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

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ level: string }>;
}) {
  const { level: levelStr } = await params;
  const level = Number.parseInt(levelStr, 10);

  if (!Number.isFinite(level) || !PUBLIC_BETA_LEVELS.has(level)) {
    notFound();
  }

  return <ChallengeClient level={level} />;
}
