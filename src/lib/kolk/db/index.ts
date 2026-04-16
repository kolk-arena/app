/**
 * Kolk Arena — Standalone Supabase Client
 *
 * Standalone Supabase client for Kolk Arena.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

  const [sessionCheck, submissionCheck] = await Promise.all([
    supabaseAdmin.from('ka_challenge_sessions').select('id', { head: true, count: 'exact' }).limit(1),
    supabaseAdmin.from('ka_submissions').select('challenge_session_id', { head: true, count: 'exact' }).limit(1),
  ]);

  if (sessionCheck.error || submissionCheck.error) {
    const details = [
      sessionCheck.error?.message,
      submissionCheck.error?.message,
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
