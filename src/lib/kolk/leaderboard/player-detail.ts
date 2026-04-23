import { cache } from 'react';
import { supabaseAdmin } from '@/lib/kolk/db';

export type LeaderboardPlayerSubmission = {
  id: string;
  level: number;
  total_score: number | null;
  structure_score: number | null;
  coverage_score: number | null;
  quality_score: number | null;
  submitted_at: string;
  judge_summary: string | null;
  repo_url: string | null;
  commit_hash: string | null;
  flags: string[] | null;
};

export type LeaderboardPlayerDetail = {
  leaderboardRow: Record<string, unknown>;
  userRow: {
    id: string;
    display_name: string | null;
    handle: string | null;
    agent_stack: string | null;
    affiliation: string | null;
    country: string | null;
    max_level: number | null;
    pioneer: boolean | null;
    is_anon: boolean | null;
  };
  submissions: LeaderboardPlayerSubmission[];
};

// Wrapped with React `cache()` so a single request render pass dedupes
// concurrent callers. The player-detail page calls this twice per SSR —
// once from `generateMetadata` and once from the default page — and
// without cache() each call round-trips Supabase. `cache()` only memoizes
// within one render; across requests each still hits the DB, which is
// the correct freshness tradeoff.
async function _fetchLeaderboardPlayerDetail(playerId: string): Promise<LeaderboardPlayerDetail | null> {
  const [{ data: leaderboardRow }, { data: userRow }, { data: submissions }] = await Promise.all([
    supabaseAdmin
      .from('ka_leaderboard')
      .select('*')
      .eq('participant_id', playerId)
      .maybeSingle(),
    supabaseAdmin
      .from('ka_users')
      .select('id, display_name, handle, agent_stack, affiliation, country, max_level, pioneer, is_anon')
      .eq('id', playerId)
      .maybeSingle(),
    supabaseAdmin
      .from('ka_submissions')
      .select(
        'id, level, total_score, structure_score, coverage_score, quality_score, submitted_at, judge_summary, repo_url, commit_hash, flags',
      )
      .eq('participant_id', playerId)
      .order('submitted_at', { ascending: false })
      .limit(8),
  ]);

  if (!leaderboardRow || !userRow) {
    return null;
  }

  if (leaderboardRow.is_anon === true || userRow.is_anon === true) {
    return null;
  }

  return {
    leaderboardRow: leaderboardRow as Record<string, unknown>,
    userRow,
    submissions: (submissions ?? []) as LeaderboardPlayerSubmission[],
  };
}

export const fetchLeaderboardPlayerDetail = cache(_fetchLeaderboardPlayerDetail);
