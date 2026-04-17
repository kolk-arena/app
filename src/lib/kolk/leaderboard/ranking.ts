import { supabaseAdmin } from '@/lib/kolk/db';
import {
  colorBandToQualityLabel,
  getSuggestedTimeMinutes,
  scoreToColorBand,
} from '@/lib/kolk/beta-contract';

export type PublicLeaderboardRow = {
  player_id: string;
  rank: number;
  display_name: string;
  handle: string | null;
  framework: string | null;
  school: string | null;
  highest_level: number;
  best_score_on_highest: number;
  best_color_band: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  best_quality_label: string | null;
  solve_time_seconds: number | null;
  efficiency_badge: boolean;
  total_score: number;
  levels_completed: number;
  tier: string;
  last_submission_at: string | null;
};

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

function resolveBestScoreOnHighest(entry: Record<string, unknown>, highestLevel: number) {
  const direct = asFiniteNumber(entry.best_score_on_highest, NaN);
  if (Number.isFinite(direct)) return direct;

  const bestScores = sanitizeBestScores(entry.best_scores);
  return asFiniteNumber(bestScores[String(highestLevel)], 0);
}

function normalizeLeaderboardRow(
  entry: Record<string, unknown>,
  frameworkByParticipantId: Map<string, string | null>,
): PublicLeaderboardRow | null {
  const playerId = asOptionalString(entry.participant_id);
  if (!playerId) return null;

  const highestLevel = Math.max(0, Math.trunc(asFiniteNumber(entry.highest_level, 0)));
  const bestScoreOnHighest = resolveBestScoreOnHighest(entry, highestLevel);
  const bestColorBandValue = asOptionalString(entry.best_color_band);
  const bestColorBand =
    bestColorBandValue === 'RED'
    || bestColorBandValue === 'ORANGE'
    || bestColorBandValue === 'YELLOW'
    || bestColorBandValue === 'GREEN'
    || bestColorBandValue === 'BLUE'
      ? bestColorBandValue
      : (highestLevel > 0 ? scoreToColorBand(bestScoreOnHighest) : null);

  const solveTimeRaw = asFiniteNumber(entry.solve_time_seconds, NaN);
  const solveTimeSeconds = Number.isFinite(solveTimeRaw) ? Math.max(0, Math.trunc(solveTimeRaw)) : null;
  const efficiencyBadge =
    entry.efficiency_badge === true
    || (solveTimeSeconds != null && highestLevel > 0 && solveTimeSeconds <= getSuggestedTimeMinutes(highestLevel) * 60);
  const tier = asOptionalString(entry.tier);

  return {
    player_id: playerId,
    rank: 0,
    display_name: asOptionalString(entry.display_name) ?? 'Anonymous',
    handle: asOptionalString(entry.handle),
    framework: frameworkByParticipantId.get(playerId) ?? asOptionalString(entry.framework),
    school: asOptionalString(entry.school),
    highest_level: highestLevel,
    best_score_on_highest: bestScoreOnHighest,
    best_color_band: bestColorBand,
    best_quality_label:
      asOptionalString(entry.best_quality_label) ?? (bestColorBand ? colorBandToQualityLabel(bestColorBand) : null),
    solve_time_seconds: solveTimeSeconds,
    efficiency_badge: efficiencyBadge,
    total_score: asFiniteNumber(entry.total_score, 0),
    levels_completed: Math.max(0, Math.trunc(asFiniteNumber(entry.levels_completed, 0))),
    tier: tier && VALID_TIERS.has(tier) ? tier : 'starter',
    last_submission_at: asIsoDateString(entry.last_submission_at),
  };
}

function compareLeaderboardRows(a: PublicLeaderboardRow, b: PublicLeaderboardRow) {
  if (b.highest_level !== a.highest_level) return b.highest_level - a.highest_level;
  if (b.best_score_on_highest !== a.best_score_on_highest) return b.best_score_on_highest - a.best_score_on_highest;

  const aTime = a.solve_time_seconds ?? Number.POSITIVE_INFINITY;
  const bTime = b.solve_time_seconds ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;

  return 0;
}

export function rankLeaderboardRows(entries: PublicLeaderboardRow[]): PublicLeaderboardRow[] {
  const sorted = [...entries].sort(compareLeaderboardRows);
  let currentRank = 1;

  return sorted.map((entry, index) => {
    if (index > 0) {
      const prev = sorted[index - 1];
      const sameFrontier =
        entry.highest_level === prev.highest_level
        && entry.best_score_on_highest === prev.best_score_on_highest
        && (entry.solve_time_seconds ?? null) === (prev.solve_time_seconds ?? null);

      if (!sameFrontier) {
        currentRank = index + 1;
      }
    }

    return {
      ...entry,
      rank: currentRank,
    };
  });
}

export async function fetchRankedLeaderboardRows(options?: { school?: string | null }) {
  let query = supabaseAdmin
    .from('ka_leaderboard')
    .select('*', { count: 'exact' })
    .range(0, 9999);

  if (options?.school) {
    query = query.eq('school', options.school);
  }

  const { data: rawRows, count, error } = await query;
  if (error) throw error;

  const participantIds = (rawRows ?? [])
    .map((entry) => asOptionalString((entry as Record<string, unknown>).participant_id))
    .filter((value): value is string => Boolean(value));

  const frameworkByParticipantId = new Map<string, string | null>();

  if (participantIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('ka_users')
      .select('id, framework')
      .in('id', participantIds);

    for (const user of users ?? []) {
      frameworkByParticipantId.set(user.id as string, asOptionalString(user.framework));
    }
  }

  const normalized = (rawRows ?? [])
    .map((entry) => normalizeLeaderboardRow(entry as Record<string, unknown>, frameworkByParticipantId))
    .filter((entry): entry is PublicLeaderboardRow => entry !== null);

  return {
    rows: rankLeaderboardRows(normalized),
    total: count ?? normalized.length,
  };
}
