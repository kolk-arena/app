/**
 * Kolk Arena — Anonymous participant helpers
 *
 * Anonymous players progress via the server-issued `kolk_anon_session`
 * cookie. For L0-only runs we never materialize a participant — the run
 * stays purely session-bound. But once an anonymous run CLEARS the
 * Dual-Gate at L1+ and becomes leaderboard-eligible, we mint a lightweight
 * `ka_users` row so the existing leaderboard FK holds and different anon
 * browsers stay distinguishable from each other.
 *
 * See docs/PROFILE_API.md §Anonymous beta progression for the full contract.
 */

import { hashCode } from '@/lib/kolk/auth';
import { supabaseAdmin } from '@/lib/kolk/db';

export interface AnonParticipant {
  id: string;
  display_name: string;
}

/**
 * Find or create the `ka_users` row that represents an anonymous browser
 * session. Idempotent: concurrent calls with the same token return the
 * same id via the partial unique index on `anon_session_hash`.
 *
 * The visible label is "Anonymous <4>" where <4> is the first 4 lowercase
 * hex chars of the session hash. That's stable per browser and makes two
 * different anon rows visually distinct on the public leaderboard without
 * leaking anything about the underlying token.
 */
export async function ensureAnonUser(anonSessionToken: string): Promise<AnonParticipant> {
  const anonHash = hashCode(anonSessionToken);

  const { data: existing } = await supabaseAdmin
    .from('ka_users')
    .select('id, display_name')
    .eq('anon_session_hash', anonHash)
    .eq('is_anon', true)
    .maybeSingle();

  if (existing?.id) {
    return {
      id: existing.id as string,
      display_name: (existing.display_name as string | null) ?? buildAnonDisplayName(anonHash),
    };
  }

  const displayName = buildAnonDisplayName(anonHash);

  const { data: created, error } = await supabaseAdmin
    .from('ka_users')
    .insert({
      email: null,
      display_name: displayName,
      is_verified: false,
      is_anon: true,
      anon_session_hash: anonHash,
    })
    .select('id, display_name')
    .single();

  if (error || !created?.id) {
    // A concurrent insert may have won the race; retry the SELECT.
    const { data: retry } = await supabaseAdmin
      .from('ka_users')
      .select('id, display_name')
      .eq('anon_session_hash', anonHash)
      .eq('is_anon', true)
      .maybeSingle();

    if (retry?.id) {
      return {
        id: retry.id as string,
        display_name: (retry.display_name as string | null) ?? displayName,
      };
    }

    throw error ?? new Error('Failed to ensure anonymous participant row');
  }

  return {
    id: created.id as string,
    display_name: (created.display_name as string | null) ?? displayName,
  };
}

function buildAnonDisplayName(anonHash: string): string {
  const shortLabel = anonHash.slice(0, 4).toLowerCase();
  return `Anonymous ${shortLabel}`;
}
