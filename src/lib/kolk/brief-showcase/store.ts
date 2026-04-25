/**
 * ChallengeBrief Preview — Supabase data layer
 *
 * Hardening (2026-04-23):
 *
 * - `getLatestPromotedBatch` now filters out rows past `expires_at`, so a
 *   stalled cron (provider outage, missing secret, region hiccup) can no
 *   longer serve the same frozen batch forever — the public route sees
 *   "no batch" and 503s, which is the correct drop-dead behaviour.
 *
 * - The `data as unknown as RawShowcaseRow[]` double cast was replaced
 *   with a minimal shape-check that throws if Supabase returns a row
 *   missing the required fields. Much cheaper than full Zod, still
 *   surfaces schema drift at the boundary instead of inside UI code.
 */

import { supabaseAdmin } from '@/lib/kolk/db';
import { normalizeLocale } from './config';

export interface DbBriefShowcaseRow {
  batch_id: string;
  slot_index: number;
  level: number;
  title: string;
  industry?: string | null;
  ceo_name?: string | null;
  ceo_title?: string | null;
  quote: string;
  core_needs: string[];
  deliverables: string[];
  translations: Record<string, {
    title?: string;
    industry?: string;
    ceo_title?: string;
    request_context: string;
    scoring_focus: string[];
    output_shape: string[];
  }>;
  generated_at: string;
  expires_at: string;
  qc_status: 'passed' | 'failed';
  qc_reasons: string[];
  promoted_at: string | null;
}

export interface RawShowcaseRow {
  id: string;
  batch_id: string;
  slot_index: number;
  level: number;
  title: string;
  industry: string | null;
  ceo_name: string | null;
  ceo_title: string | null;
  quote: string;
  core_needs: string[];
  deliverables: string[];
  translations: Record<string, {
    title?: string;
    industry?: string;
    ceo_title?: string;
    request_context: string;
    scoring_focus: string[];
    output_shape: string[];
  }>;
  generated_at: string;
  expires_at: string;
  qc_status: string;
  qc_reasons: string[];
  promoted_at: string | null;
}

export async function getLatestPromotedBatch(): Promise<RawShowcaseRow[] | null> {
  const nowIso = new Date().toISOString();

  const { data: latestRow } = await supabaseAdmin
    .from('ka_brief_showcases')
    .select('batch_id')
    .eq('qc_status', 'passed')
    .not('promoted_at', 'is', null)
    .gt('expires_at', nowIso)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRow) return null;

  const { data, error } = await supabaseAdmin
    .from('ka_brief_showcases')
    .select('*')
    .eq('batch_id', latestRow.batch_id)
    .eq('qc_status', 'passed')
    .not('promoted_at', 'is', null)
    .gt('expires_at', nowIso)
    .order('slot_index', { ascending: true });

  if (error || !data || data.length === 0) return null;

  return data.map((row, index) => {
    const candidate = row as Record<string, unknown>;
    const missing: string[] = [];
    for (const key of ['id', 'batch_id', 'slot_index', 'level', 'title', 'quote', 'generated_at', 'expires_at'] as const) {
      if (candidate[key] === undefined) missing.push(key);
    }
    if (missing.length > 0) {
      throw new Error(`ka_brief_showcases row ${index} missing required fields: ${missing.join(', ')}`);
    }
    return candidate as unknown as RawShowcaseRow;
  });
}

export async function insertBatch(rows: DbBriefShowcaseRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from('ka_brief_showcases').insert(rows);
  if (error) {
    throw new Error(`Failed to insert brief showcase batch: ${error.message}`);
  }
}

/**
 * Returns the `generated_at` timestamp of the most recently promoted,
 * still-unexpired batch, or `null` if none exists. Used by the cron
 * route to skip refresh work when a batch was generated recently — a
 * retry from Vercel Cron, a manual `curl`, or an overlapping hourly
 * tick would otherwise create duplicate batches and waste AI budget.
 */
export async function getMostRecentPromotedBatchTimestamp(): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from('ka_brief_showcases')
    .select('generated_at')
    .eq('qc_status', 'passed')
    .not('promoted_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const raw = (data as Record<string, unknown>).generated_at;
  if (typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function deleteExpiredBefore(cutoff: Date): Promise<void> {
  const { error } = await supabaseAdmin
    .from('ka_brief_showcases')
    .delete()
    .lt('expires_at', cutoff.toISOString());
  if (error) {
    console.error('[brief-showcase] Failed to clean up expired rows:', error);
  }
}

export function toClientRequests(rows: RawShowcaseRow[], locale: string) {
  const normalizedLocale = normalizeLocale(locale);
  return rows.map((row) => {
    const tx = row.translations?.[normalizedLocale];
    return {
      level: row.level,
      scenarioTitle: tx?.title ?? row.title,
      industry: tx?.industry ?? row.industry ?? '',
      requesterName: row.ceo_name ?? '',
      requesterRole: tx?.ceo_title ?? row.ceo_title ?? '',
      requestContext: tx?.request_context ?? row.quote,
      scoringFocus: tx?.scoring_focus ?? row.core_needs,
      outputShape: tx?.output_shape ?? row.deliverables,
    };
  });
}
