/**
 * GET /api/auth/callback — Exchange Supabase auth code for session and sync ka_users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/kolk/db';
import { syncArenaIdentityFromSupabaseUser, sanitizeNextPath } from '@/lib/kolk/auth/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const next = request.nextUrl.searchParams.get('next');
  const nextPath = sanitizeNextPath(next);
  const redirectUrl = new URL(nextPath, request.nextUrl.origin);

  // Always create the SSR client so applyCookies is available in all paths
  const { supabase, applyCookies } = createRouteHandlerSupabaseClient(request);

  if (!code) {
    redirectUrl.searchParams.set('auth_error', 'missing_code');
    return applyCookies(NextResponse.redirect(redirectUrl));
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) {
      redirectUrl.searchParams.set('auth_error', 'exchange_failed');
      return applyCookies(NextResponse.redirect(redirectUrl));
    }

    await syncArenaIdentityFromSupabaseUser(data.user, { issueApiToken: false });

    redirectUrl.searchParams.set('auth', 'success');
    return applyCookies(NextResponse.redirect(redirectUrl));
  } catch (error) {
    console.error('[auth/callback] unexpected error:', error);
    redirectUrl.searchParams.set('auth_error', 'unexpected');
    return applyCookies(NextResponse.redirect(redirectUrl));
  }
}
