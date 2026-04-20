/**
 * Kolk Arena — Standalone Supabase Client
 *
 * Standalone Supabase client for Kolk Arena.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Admin client (server-side only, bypasses RLS)
// ---------------------------------------------------------------------------

let _admin: SupabaseClient | null = null;

/**
 * Lazy-initialized admin client using service role key.
 * Use in API routes for all DB writes and privileged reads (e.g., rubrics).
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_admin) {
      const url = process.env.KOLK_SUPABASE_URL;
      const key = process.env.KOLK_SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new Error(
          'Missing KOLK_SUPABASE_URL or KOLK_SUPABASE_SERVICE_ROLE_KEY environment variables'
        );
      }
      _admin = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return (_admin as unknown as Record<string, unknown>)[prop as string];
  },
});

let schemaReadyCache: boolean | null = null;

/**
 * Fail closed when the database has not been migrated to the session-bound runtime schema.
 * This prevents a partial rollout from serving traffic with an incompatible database shape.
 */
export async function assertRuntimeSchemaReady(): Promise<void> {
  if (schemaReadyCache) return;

  const [sessionCheck, submissionCheck, leaderboardCheck, l0Check, userCheck, identityGuardCheck] = await Promise.all([
    supabaseAdmin
      .from('ka_challenge_sessions')
      .select('attempt_token, consumed_at, retry_count, submit_attempt_timestamps_ms', { head: true, count: 'exact' })
      .limit(1),
    supabaseAdmin
      .from('ka_submissions')
      .select('challenge_session_id, unlocked, solve_time_seconds', { head: true, count: 'exact' })
      .limit(1),
    supabaseAdmin
      .from('ka_leaderboard')
      .select('best_score_on_highest, solve_time_seconds, agent_stack', { head: true, count: 'exact' })
      .limit(1),
    supabaseAdmin
      .from('ka_challenges')
      .select('id', { head: true, count: 'exact' })
      .eq('level', 0)
      .limit(1),
    supabaseAdmin
      .from('ka_users')
      .select('pioneer', { head: true, count: 'exact' })
      .limit(1),
    supabaseAdmin
      .from('ka_identity_submit_guard')
      .select('identity_key, day_bucket_pt, frozen_until', { head: true, count: 'exact' })
      .limit(1),
  ]);

  if (
    sessionCheck.error
    || submissionCheck.error
    || leaderboardCheck.error
    || l0Check.error
    || userCheck.error
    || identityGuardCheck.error
    || (l0Check.count ?? 0) < 1
  ) {
    const details = [
      sessionCheck.error?.message,
      submissionCheck.error?.message,
      leaderboardCheck.error?.message,
      userCheck.error?.message,
      identityGuardCheck.error?.message,
      (l0Check.count ?? 0) < 1 ? 'L0 onboarding seed is missing from ka_challenges.' : null,
    ].filter(Boolean).join(' | ');

    throw new Error(
      `Runtime schema is not ready for session-bound submissions. Apply the latest database migrations before serving traffic.${details ? ` ${details}` : ''}`
    );
  }

  schemaReadyCache = true;
}

// ---------------------------------------------------------------------------
// Route handler auth client (uses request cookies, writes back pending cookies)
// ---------------------------------------------------------------------------

type PendingCookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export function createRouteHandlerSupabaseClient(request: NextRequest) {
  const url = process.env.KOLK_SUPABASE_URL;
  const key = process.env.KOLK_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing KOLK_SUPABASE_URL or KOLK_SUPABASE_ANON_KEY environment variables'
    );
  }

  const pendingCookies: PendingCookie[] = [];

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  return {
    supabase,
    applyCookies<T extends NextResponse>(response: T): T {
      for (const cookie of pendingCookies) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }
      return response;
    },
  };
}

export async function createServerComponentSupabaseClient() {
  const url = process.env.KOLK_SUPABASE_URL;
  const key = process.env.KOLK_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing KOLK_SUPABASE_URL or KOLK_SUPABASE_ANON_KEY environment variables'
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Server Components are read-only for cookies. Auth-mutating flows
        // must use Route Handlers or Server Actions.
      },
    },
  });

  return { supabase };
}
