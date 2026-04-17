import { notFound } from 'next/navigation';
import { ChallengeClient } from './challenge-client';

export const metadata = {
  title: 'Challenge',
  description: 'Kolk Arena challenge page',
};

const PUBLIC_BETA_LEVELS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

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
