/**
 * POST /api/auth/logout — Clear Supabase session and invalidate Kolk Bearer token.
 * Returns error status if either revocation fails (does not mask failures as success).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/kolk/db';
import { supabaseAdmin } from '@/lib/kolk/db';
import { assertSameOrigin } from '@/lib/kolk/http/origin';

export async function POST(request: NextRequest) {
  // Block cross-origin POSTs (CSRF). Without this, an attacker page
  // can force `fetch('/api/auth/logout', { method: 'POST', credentials:
  // 'include' })` on any visitor and log them out unconditionally.
  // Matches the same guard pattern on /api/auth/device/deny and
  // /api/auth/device/verify — those are state-changing endpoints too.
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const errors: string[] = [];

  try {
    const { supabase, applyCookies } = createRouteHandlerSupabaseClient(request);

    // Get current user before signing out
    const { data: { user } } = await supabase.auth.getUser();

    // Sign out of Supabase
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      errors.push(`session_revoke_failed: ${signOutError.message}`);
    }

    // Invalidate the Kolk Bearer token. Scope the revocation by the
    // Supabase auth user id via the `auth_user_ids` array — NOT by
    // email. Two ka_users rows can collide on `email` after a
    // normalize-induced merge or a historical import with mixed case,
    // and an email-scoped update would silently clear the bearer token
    // for every row that happens to share the lowercased email. The
    // `auth_user_ids` array is the unique link between a Supabase auth
    // identity and a single ka_users row, so `.contains()` is safe
    // even under collision.
    if (user?.id) {
      const { error: tokenError } = await supabaseAdmin
        .from('ka_users')
        .update({ token_hash: null })
        .contains('auth_user_ids', [user.id]);

      if (tokenError) {
        errors.push(`token_revoke_failed: ${tokenError.message}`);
      }
    }

    if (errors.length > 0) {
      return applyCookies(NextResponse.json(
        { success: false, errors, code: 'PARTIAL_LOGOUT' },
        { status: 500 },
      ));
    }

    return applyCookies(NextResponse.json({ success: true }));
  } catch (error) {
    console.error('[auth/logout] unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Logout failed', code: 'LOGOUT_FAILED' },
      { status: 500 },
    );
  }
}
