import { NextResponse } from 'next/server';
import { fetchLeaderboardPlayerDetail } from '@/lib/kolk/leaderboard/player-detail';

type RouteProps = {
  params: Promise<{ playerId: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_TIERS = new Set(['starter', 'builder', 'specialist', 'champion']);

function asFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asIsoDateString(value: unknown) {
  const candidate = asOptionalString(value);
  if (!candidate) return null;
  return Number.isNaN(new Date(candidate).getTime()) ? null : candidate;
}

function sanitizeBestScores(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, number>;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([level, score]) => [level, asFiniteNumber(score, NaN)] as const)
      .filter(([, score]) => Number.isFinite(score)),
  );
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { playerId } = await params;

  if (!UUID_RE.test(playerId)) {
    return NextResponse.json(
      { error: 'Invalid player id', code: 'INVALID_PLAYER_ID' },
      { status: 400 },
    );
  }

  const detail = await fetchLeaderboardPlayerDetail(playerId);

  if (!detail) {
    return NextResponse.json(
      { error: 'Player not found', code: 'PLAYER_NOT_FOUND' },
      { status: 404 },
    );
  }

  const tier = asOptionalString(detail.leaderboardRow.tier);

  return NextResponse.json({
    leaderboardRow: {
      ...detail.leaderboardRow,
      highest_level: Math.max(0, Math.trunc(asFiniteNumber(detail.leaderboardRow.highest_level, 0))),
      best_score_on_highest: asFiniteNumber(detail.leaderboardRow.best_score_on_highest, 0),
      best_color_band: asOptionalString(detail.leaderboardRow.best_color_band),
      best_quality_label: asOptionalString(detail.leaderboardRow.best_quality_label),
      solve_time_seconds: Number.isFinite(asFiniteNumber(detail.leaderboardRow.solve_time_seconds, NaN))
        ? Math.max(0, Math.trunc(asFiniteNumber(detail.leaderboardRow.solve_time_seconds, 0)))
        : null,
      efficiency_badge: detail.leaderboardRow.efficiency_badge === true,
      framework: asOptionalString(detail.leaderboardRow.framework),
      total_score: asFiniteNumber(detail.leaderboardRow.total_score, 0),
      levels_completed: Math.max(0, Math.trunc(asFiniteNumber(detail.leaderboardRow.levels_completed, 0))),
      tier: tier && VALID_TIERS.has(tier) ? tier : 'starter',
      last_submission_at: asIsoDateString(detail.leaderboardRow.last_submission_at),
      best_scores: sanitizeBestScores(detail.leaderboardRow.best_scores),
    },
    userRow: {
      ...detail.userRow,
      display_name: asOptionalString(detail.userRow.display_name),
      handle: asOptionalString(detail.userRow.handle),
      framework: asOptionalString(detail.userRow.framework),
      school: asOptionalString(detail.userRow.school),
      country: asOptionalString(detail.userRow.country),
      max_level: Math.max(0, Math.trunc(asFiniteNumber(detail.userRow.max_level, 0))),
      pioneer: detail.userRow.pioneer === true,
    },
    submissions: (detail.submissions ?? []).map((submission) => ({
      ...submission,
      level: Math.max(0, Math.trunc(asFiniteNumber(submission.level, 0))),
      total_score: Number.isFinite(asFiniteNumber(submission.total_score, NaN))
        ? asFiniteNumber(submission.total_score, 0)
        : null,
      structure_score: Number.isFinite(asFiniteNumber(submission.structure_score, NaN))
        ? asFiniteNumber(submission.structure_score, 0)
        : null,
      coverage_score: Number.isFinite(asFiniteNumber(submission.coverage_score, NaN))
        ? asFiniteNumber(submission.coverage_score, 0)
        : null,
      quality_score: Number.isFinite(asFiniteNumber(submission.quality_score, NaN))
        ? asFiniteNumber(submission.quality_score, 0)
        : null,
      submitted_at: asIsoDateString(submission.submitted_at),
      judge_summary: asOptionalString(submission.judge_summary),
      repo_url: asOptionalString(submission.repo_url),
      commit_hash: asOptionalString(submission.commit_hash),
      flags: Array.isArray(submission.flags)
        ? submission.flags.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0)
        : [],
    })),
  });
}
