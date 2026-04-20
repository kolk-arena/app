/**
 * GET /api/auth/oauth/:provider — Start GitHub or Google login via Supabase Auth.
 *
 * Uses createRouteHandlerSupabaseClient (SSR) so PKCE code_verifier
 * cookies are stored before the redirect to the OAuth provider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/kolk/db';
import { OAuthProviderSchema } from '@/lib/kolk/types';
import { getAppUrl, sanitizeNextPath } from '@/lib/kolk/auth/server';
import { isPublicOAuthProviderEnabled } from '@/lib/frontend/app-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const parsed = OAuthProviderSchema.safeParse(provider);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Unsupported OAuth provider', code: 'UNSUPPORTED_PROVIDER' },
      { status: 400 },
    );
  }

  const { supabase, applyCookies } = createRouteHandlerSupabaseClient(request);

  const next = request.nextUrl.searchParams.get('next');
  const nextPath = sanitizeNextPath(next);
  if (!isPublicOAuthProviderEnabled(parsed.data)) {
    const redirectUrl = new URL(nextPath, getAppUrl(request));
    redirectUrl.searchParams.set('auth_error', 'provider_disabled');
    return NextResponse.redirect(redirectUrl);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data,
    options: {
      redirectTo: `${getAppUrl(request)}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
      scopes: parsed.data === 'github' ? 'user:email' : undefined,
    },
  });

  if (error || !data.url) {
    return NextResponse.json(
      { error: 'Failed to start OAuth login', code: 'OAUTH_START_FAILED' },
      { status: 400 },
    );
  }

  // Apply PKCE cookies before redirecting
  return applyCookies(NextResponse.redirect(data.url));
}
