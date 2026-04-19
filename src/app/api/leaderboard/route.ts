/**
 * GET /api/leaderboard — View rankings
 *
 * Sorting (public beta contract):
 *   1. highest_level DESC
 *   2. best_score_on_highest DESC
 *   3. solve_time_seconds ASC
 *
 * Query params:
 *   ?page=1&limit=50
 *   ?framework=Claude%20Code
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchRankedLeaderboardRows } from '@/lib/kolk/leaderboard/ranking';

function readPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function asOptionalString(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page = readPositiveInt(searchParams.get('page'), 1, 10_000);
  const limit = readPositiveInt(searchParams.get('limit'), 50, 100);
  const framework = asOptionalString(searchParams.get('framework'));

  try {
    const { rows, total, frameworkStats } = await fetchRankedLeaderboardRows({ framework });
    const offset = (page - 1) * limit;

    return NextResponse.json({
      leaderboard: rows.slice(offset, offset + limit),
      total,
      page,
      limit,
      framework_stats: frameworkStats,
    });
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard', code: 'LEADERBOARD_ERROR' },
      { status: 500 },
    );
  }
}
