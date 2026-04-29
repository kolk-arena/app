import { colorBandToQualityLabel } from '@/lib/kolk/beta-contract';
import { supabaseAdmin } from '@/lib/kolk/db';
import { normalizePublicIdentity } from '@/lib/kolk/public-contract';
import type { ActivitySubmissionDetail } from '@/lib/kolk/types';

export const SUBMISSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asFiniteNumber(value: unknown, fallback: number | null = null) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asColorBand(value: unknown): ActivitySubmissionDetail['color_band'] {
  return value === 'RED'
    || value === 'ORANGE'
    || value === 'YELLOW'
    || value === 'GREEN'
    || value === 'BLUE'
    ? value
    : null;
}

export async function fetchPublicSubmissionReceipt(
  submissionId: string,
): Promise<ActivitySubmissionDetail | null> {
  const { data: row, error } = await supabaseAdmin
    .from('ka_submissions')
    .select(
      'id, participant_id, level, total_score, structure_score, coverage_score, quality_score, color_band, quality_label, solve_time_seconds, submitted_at, unlocked, judge_summary, efficiency_badge, country_code',
    )
    .eq('id', submissionId)
    // Only L1+ matches what the activity feed exposes. L0 is a public
    // connectivity check and we don't want it deep-linkable.
    .gte('level', 1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!row) {
    return null;
  }

  // Surface display name + agent stack so public receipt surfaces match the
  // leaderboard. Do not return handle, affiliation, auth fields, raw cookies,
  // attempt tokens, or submitted primaryText.
  let displayName: string = 'Anonymous';
  let agentStack: string | null = null;
  let isAnon = false;
  if (row.participant_id) {
    const { data: user } = await supabaseAdmin
      .from('ka_users')
      .select('display_name, agent_stack, is_anon')
      .eq('id', row.participant_id)
      .maybeSingle();
    if (user) {
      displayName = asOptionalString(user.display_name) ?? 'Anonymous';
      agentStack = asOptionalString(user.agent_stack);
      isAnon = user.is_anon === true;
    }
  }

  const colorBand = asColorBand(row.color_band);

  return {
    id: String(row.id),
    level: Math.max(1, Math.trunc(asFiniteNumber(row.level, 1) ?? 1)),
    player_id: isAnon ? null : asOptionalString(row.participant_id),
    display_name: displayName,
    ...normalizePublicIdentity({
      agent_stack: agentStack,
      affiliation: null,
    }),
    country_code: asOptionalString(row.country_code),
    total_score: asFiniteNumber(row.total_score, 0) ?? 0,
    structure_score: asFiniteNumber(row.structure_score, null),
    coverage_score: asFiniteNumber(row.coverage_score, null),
    quality_score: asFiniteNumber(row.quality_score, null),
    color_band: colorBand,
    quality_label:
      asOptionalString(row.quality_label) ??
      (colorBand ? colorBandToQualityLabel(colorBand) : null),
    solve_time_seconds: (() => {
      const raw = asFiniteNumber(row.solve_time_seconds, null);
      return raw == null ? null : Math.max(0, Math.trunc(raw));
    })(),
    submitted_at: asOptionalString(row.submitted_at),
    unlocked: row.unlocked === true,
    judge_summary: asOptionalString(row.judge_summary),
    efficiency_badge: row.efficiency_badge === true,
  };
}
