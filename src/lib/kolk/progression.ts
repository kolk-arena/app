import { supabaseAdmin } from '@/lib/kolk/db';
import { isDualGateUnlock } from '@/lib/kolk/beta-contract';

type SubmissionUnlockRow = {
  level: number;
  unlocked: boolean | null;
  structure_score: number | string | null;
  coverage_score: number | string | null;
  quality_score: number | string | null;
};

function toFiniteNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isUnlockedSubmission(row: SubmissionUnlockRow): boolean {
  if (row.unlocked === true) return true;
  return isDualGateUnlock(
    toFiniteNumber(row.structure_score),
    toFiniteNumber(row.coverage_score),
    toFiniteNumber(row.quality_score),
  );
}

export function getUnlockedLevelFromRows(rows: SubmissionUnlockRow[]): number {
  let maxLevel = 0;

  for (const row of rows) {
    if (isUnlockedSubmission(row) && row.level > maxLevel) {
      maxLevel = row.level;
    }
  }

  return maxLevel;
}

export async function getAnonymousMaxUnlockedLevel(anonToken: string): Promise<number> {
  const { data: anonSubs } = await supabaseAdmin
    .from('ka_submissions')
    .select('level, unlocked, structure_score, coverage_score, quality_score')
    .eq('anon_token', anonToken)
    .order('level', { ascending: false })
    .limit(32);

  return getUnlockedLevelFromRows((anonSubs ?? []) as SubmissionUnlockRow[]);
}
