import { supabaseAdmin } from '@/lib/kolk/db';
import {
  colorBandToQualityLabel,
  getSuggestedTimeMinutes,
  scoreToColorBand,
} from '@/lib/kolk/beta-contract';
import { hashCode } from '@/lib/kolk/auth';
import { asOptionalPublicString, normalizeAgentStackStat, normalizePublicIdentity } from '@/lib/kolk/public-contract';
import { TIERS } from '@/lib/kolk/types';

export type PublicLeaderboardRow = {
  row_key: string;
  player_id: string | null;
  rank: number;
  display_name: string;
  handle: string | null;
  agent_stack: string | null;
  affiliation: string | null;
  highest_level: number;
  best_score_on_highest: number;
  best_color_band: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE' | null;
  best_quality_label: string | null;
  solve_time_seconds: number | null;
  efficiency_badge: boolean;
  total_score: number;
  levels_completed: number;
  tier: string;
  pioneer: boolean;
  is_anon: boolean;
  last_submission_at: string | null;
  country_code?: string | null;
};

type SortableLeaderboardRow = PublicLeaderboardRow & {
  sort_player_id: string;
};

const VALID_TIERS = new Set<string>(TIERS);

function asFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const asOptionalString = asOptionalPublicString;

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
  agentStackByParticipantId: Map<string, string | null>,
): SortableLeaderboardRow | null {
  const playerId = asOptionalString(entry.participant_id);
  if (!playerId) return null;
  const isAnon = entry.is_anon === true;

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
    row_key: isAnon ? `anon_${hashCode(playerId).slice(0, 16)}` : `player_${playerId}`,
    player_id: isAnon ? null : playerId,
    rank: 0,
    sort_player_id: playerId,
    display_name: asOptionalString(entry.display_name) ?? 'Anonymous',
    handle: asOptionalString(entry.handle),
    ...normalizePublicIdentity({
      agent_stack: agentStackByParticipantId.get(playerId) ?? asOptionalString(entry.agent_stack),
      affiliation: asOptionalString(entry.affiliation),
    }),
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
    pioneer: entry.pioneer === true,
    is_anon: isAnon,
    last_submission_at: asIsoDateString(entry.last_submission_at),
    country_code: asOptionalString(entry.country_code),
  };
}

function compareLeaderboardRows(a: SortableLeaderboardRow, b: SortableLeaderboardRow) {
  if (b.highest_level !== a.highest_level) return b.highest_level - a.highest_level;
  if (b.best_score_on_highest !== a.best_score_on_highest) return b.best_score_on_highest - a.best_score_on_highest;

  const aTime = a.solve_time_seconds ?? Number.POSITIVE_INFINITY;
  const bTime = b.solve_time_seconds ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;

  return a.sort_player_id.localeCompare(b.sort_player_id);
}

export function rankLeaderboardRows(entries: SortableLeaderboardRow[]): PublicLeaderboardRow[] {
  const sorted = [...entries].sort(compareLeaderboardRows);
  let currentRank = 1;

  const ranked = sorted.map((entry, index) => {
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

  return ranked.map((entry) => {
    const publicEntry: Partial<SortableLeaderboardRow> = { ...entry };
    delete publicEntry.sort_player_id;
    return publicEntry as PublicLeaderboardRow;
  });
}

export async function fetchRankedLeaderboardRows(options?: {
  agentStack?: string | null;
  affiliation?: string | null;
}) {
  const agentStackNeedle = asOptionalString(options?.agentStack)?.toLowerCase() ?? null;
  const affiliationNeedle = asOptionalString(options?.affiliation)?.toLowerCase() ?? null;
  let matchedAgentStackUsers: Array<{ id: string; agent_stack: string | null }> | null = null;

  if (agentStackNeedle) {
    const { data: agentStackUsers, error: agentStackError } = await supabaseAdmin
      .from('ka_users')
      .select('id, agent_stack')
      .ilike('agent_stack', `%${agentStackNeedle}%`)
      .range(0, 9999);

    if (agentStackError) throw agentStackError;

    matchedAgentStackUsers = (agentStackUsers ?? [])
      .map((user) => ({
        id: String(user.id),
        agent_stack: asOptionalString(user.agent_stack),
      }))
      .filter((user) => user.id.length > 0);

    if (matchedAgentStackUsers.length === 0) {
      return {
        rows: [] as PublicLeaderboardRow[],
        total: 0,
        agentStackStats: [] as Array<{ agent_stack: string; count: number; percentage: number }>,
      };
    }
  }

  let query = supabaseAdmin
    .from('ka_leaderboard')
    .select('*', { count: 'exact' });

  if (affiliationNeedle) {
    query = query.ilike('affiliation', `%${affiliationNeedle}%`);
  }

  if (matchedAgentStackUsers) {
    query = query.in(
      'participant_id',
      matchedAgentStackUsers.map((user) => user.id),
    );
  }

  const { data: rawRows, count, error } = await query.range(0, 9999);
  if (error) throw error;

  const participantIds = (rawRows ?? [])
    .map((entry) => asOptionalString((entry as Record<string, unknown>).participant_id))
    .filter((value): value is string => Boolean(value));

  const agentStackByParticipantId = new Map<string, string | null>();

  if (matchedAgentStackUsers) {
    for (const user of matchedAgentStackUsers) {
      agentStackByParticipantId.set(user.id, user.agent_stack);
    }
  } else if (participantIds.length > 0) {
    const { data: users } = await supabaseAdmin
      .from('ka_users')
      .select('id, agent_stack')
      .in('id', participantIds);

    for (const user of users ?? []) {
      agentStackByParticipantId.set(user.id as string, asOptionalString(user.agent_stack));
    }
  }

  const normalized = (rawRows ?? [])
    .map((entry) => normalizeLeaderboardRow(entry as Record<string, unknown>, agentStackByParticipantId))
    .filter((entry): entry is SortableLeaderboardRow => entry !== null);

  const filtered = normalized.filter((row) => {
    if (agentStackNeedle && !(row.agent_stack?.toLowerCase().includes(agentStackNeedle))) {
      return false;
    }
    if (affiliationNeedle && !(row.affiliation?.toLowerCase().includes(affiliationNeedle))) {
      return false;
    }
    return true;
  });

  const ranked = rankLeaderboardRows(filtered);

  const top100 = ranked.slice(0, 100);
  const agentStackCounts = new Map<string, number>();
  let statCount = 0;
  for (const row of top100) {
    if (row.agent_stack) {
      agentStackCounts.set(row.agent_stack, (agentStackCounts.get(row.agent_stack) ?? 0) + 1);
      statCount++;
    }
  }
  
  const agentStackStats = Array.from(agentStackCounts.entries())
    .map(([agent_stack, count]) => normalizeAgentStackStat({
      agent_stack,
      count,
      percentage: Math.round((count / Math.max(1, statCount)) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.agent_stack.localeCompare(b.agent_stack));

  return {
    rows: ranked,
    total: agentStackNeedle || affiliationNeedle ? ranked.length : (count ?? ranked.length),
    agentStackStats,
  };
}
