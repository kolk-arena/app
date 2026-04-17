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
    framework: string | null;
    school: string | null;
    country: string | null;
    max_level: number | null;
  };
  submissions: LeaderboardPlayerSubmission[];
};

export async function fetchLeaderboardPlayerDetail(playerId: string): Promise<LeaderboardPlayerDetail | null> {
  const [{ data: leaderboardRow }, { data: userRow }, { data: submissions }] = await Promise.all([
    supabaseAdmin
      .from('ka_leaderboard')
      .select('*')
      .eq('participant_id', playerId)
      .maybeSingle(),
    supabaseAdmin
      .from('ka_users')
      .select('id, display_name, handle, framework, school, country, max_level')
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

  return {
    leaderboardRow: leaderboardRow as Record<string, unknown>,
    userRow,
    submissions: (submissions ?? []) as LeaderboardPlayerSubmission[],
  };
}
