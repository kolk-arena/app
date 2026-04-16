/**
 * GET /api/leaderboard — View rankings
 *
 * Sorting (per LEADERBOARD.md):
 *   1. highest_level DESC — further progression wins
 *   2. best_score on that highest level DESC — higher score on frontier level wins
 *   3. last_submission_at ASC — earlier submission wins ties
 *
 * Query params:
 *   ?page=1&limit=50     — pagination
 *   ?school=TecMilenio   — filter by school
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/kolk/db';

type LeaderboardApiEntry = {
  player_id: string;
  rank: number;
  display_name: string;
  handle: string | null;
  school: string | null;
  highest_level: number;
  best_score_on_highest: number;
  total_score: number;
  levels_completed: number;
  tier: string;
  last_submission_at: string | null;
};

const VALID_TIERS = new Set(['starter', 'builder', 'specialist', 'champion']);

function readPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const page = readPositiveInt(searchParams.get('page'), 1, 10_000);
  const limit = readPositiveInt(searchParams.get('limit'), 50, 100);
  const school = asOptionalString(searchParams.get('school'));

  // Fetch all entries with explicit range (Supabase defaults to 1000)
  let query = supabaseAdmin
    .from('ka_leaderboard')
    .select('*', { count: 'exact' })
    .range(0, 9999);

  if (school) {
    query = query.eq('school', school);
  }

  const { data: allEntries, count, error } = await query;

  if (error) {
    console.error('Leaderboard fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard', code: 'LEADERBOARD_ERROR' },
      { status: 500 },
    );
  }

  // Compute best_score on highest level for each entry, then sort
  type EnrichedEntry = Record<string, unknown> & { bestOnHighest: number; lastSubMs: number };
  const enriched: EnrichedEntry[] = (allEntries ?? []).map((entry: Record<string, unknown>) => {
    const bestScores =
      entry.best_scores && typeof entry.best_scores === 'object' && !Array.isArray(entry.best_scores)
        ? (entry.best_scores as Record<string, unknown>)
        : {};
    const highestLevel = Math.max(0, Math.trunc(asFiniteNumber(entry.highest_level, 0)));
    const bestOnHighest = asFiniteNumber(bestScores[String(highestLevel)], 0);
    const lastSub = asIsoDateString(entry.last_submission_at);
    return { ...entry, bestOnHighest, lastSubMs: lastSub ? new Date(lastSub).getTime() : Infinity };
  });

  // Sort: highest_level DESC → bestOnHighest DESC → last_submission_at ASC
  enriched.sort((a, b) => {
    const aLevel = Number(a.highest_level ?? 0);
    const bLevel = Number(b.highest_level ?? 0);
    if (bLevel !== aLevel) return bLevel - aLevel;
    if (b.bestOnHighest !== a.bestOnHighest) return b.bestOnHighest - a.bestOnHighest;
    return a.lastSubMs - b.lastSubMs;
  });

  // Paginate
  const offset = (page - 1) * limit;

  // Compute rank with tie handling
  const ranked: LeaderboardApiEntry[] = [];
  let currentRank = 1;

  for (let i = 0; i < enriched.length; i++) {
    const entry = enriched[i];
    if (i > 0) {
      const prev = enriched[i - 1];
      const sameLevel = Number(entry.highest_level) === Number(prev.highest_level);
      const sameScore = entry.bestOnHighest === prev.bestOnHighest;
      if (!sameLevel || !sameScore) {
        currentRank = i + 1;
      }
    }

    // Only include entries in the current page
    if (i >= offset && i < offset + limit) {
      const playerId = asOptionalString(entry.participant_id);
      if (!playerId) continue;

      const displayName = asOptionalString(entry.display_name) ?? 'Anonymous';
      const handle = asOptionalString(entry.handle);
      const highestLevel = Math.max(0, Math.trunc(asFiniteNumber(entry.highest_level, 0)));
      const totalScore = asFiniteNumber(entry.total_score, 0);
      const levelsCompleted = Math.max(0, Math.trunc(asFiniteNumber(entry.levels_completed, 0)));
      const tier = asOptionalString(entry.tier);

      ranked.push({
        player_id: playerId,
        rank: currentRank,
        display_name: displayName,
        handle,
        school: asOptionalString(entry.school),
        highest_level: highestLevel,
        best_score_on_highest: entry.bestOnHighest,
        total_score: totalScore,
        levels_completed: levelsCompleted,
        tier: tier && VALID_TIERS.has(tier) ? tier : 'starter',
        last_submission_at: asIsoDateString(entry.last_submission_at),
      });
    }
  }

  return NextResponse.json({
    leaderboard: ranked,
    total: count ?? 0,
    page,
    limit,
  });
}
