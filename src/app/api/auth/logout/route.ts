/**
 * POST /api/auth/logout — Clear Supabase session and invalidate Kolk Bearer token.
 * Returns error status if either revocation fails (does not mask failures as success).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/kolk/db';
import { supabaseAdmin } from '@/lib/kolk/db';
import { normalizeEmail } from '@/lib/kolk/auth';

export async function POST(request: NextRequest) {
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

    // Invalidate the Kolk Bearer token
    if (user?.email) {
      const email = normalizeEmail(user.email);
      const { error: tokenError } = await supabaseAdmin
        .from('ka_users')
        .update({ token_hash: null })
        .eq('email', email);

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
