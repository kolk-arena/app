/**
 * GET /api/auth/callback — Exchange Supabase auth code for session and sync ka_users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/kolk/db';
import { ANON_SESSION_COOKIE, inferAuthMethodFromUser } from '@/lib/kolk/auth';
import { sanitizeNextPath, syncArenaIdentityFromSupabaseUser, upsertArenaIdentity } from '@/lib/kolk/auth/server';

async function resolveGithubPrimaryEmail(providerToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${providerToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'kolk-arena',
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }>;

    const primaryVerified = payload.find((entry) => entry.primary === true && entry.verified === true);
    if (typeof primaryVerified?.email === 'string' && primaryVerified.email.trim().length > 0) {
      return primaryVerified.email.trim();
    }

    const anyVerified = payload.find((entry) => entry.verified === true && typeof entry.email === 'string' && entry.email.trim().length > 0);
    return anyVerified?.email?.trim() ?? null;
  } catch (error) {
    console.error('[auth/callback] github email lookup failed:', error);
    return null;
  }
}

function isGithubNoreply(email: string | null | undefined) {
  if (!email) return false;
  return /noreply/i.test(email) && /github/i.test(email);
}

function authDebugEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.KOLK_AUTH_DEBUG === '1';
}

export async function GET(request: NextRequest) {
  // Email flows arrive here in two shapes, depending on Supabase project
  // settings + which email template fired:
  //   1. PKCE   — `?code=<uuid>`. Exchanged via `exchangeCodeForSession`.
  //              Needs the PKCE code_verifier cookie from the original
  //              signInWithOtp request to still be present in this
  //              browser (fails cross-device).
  //   2. OTP    — `?token_hash=<hash>&type=magiclink|signup|recovery|
  //              invite|email_change`. Exchanged via `verifyOtp`. Does
  //              NOT require a prior cookie — works cross-device.
  //
  // We accept both so users who click the link in a different browser
  // than where they registered can still sign in. If neither param is
  // present we surface `missing_code`; detailed exchange diagnostics stay
  // behind non-production / explicit debug logging.
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const typeParam = request.nextUrl.searchParams.get('type');
  const next = request.nextUrl.searchParams.get('next');
  const nextPath = sanitizeNextPath(next);
  const redirectUrl = new URL(nextPath, request.nextUrl.origin);
  const anonSessionToken = request.cookies.get(ANON_SESSION_COOKIE)?.value ?? null;

  // Always create the SSR client so applyCookies is available in all paths
  const { supabase, applyCookies } = createRouteHandlerSupabaseClient(request);

  if (!code && !tokenHash) {
    console.warn('[auth/callback] missing both code and token_hash', {
      host: request.nextUrl.host,
      typeParam,
      nextPath,
    });
    redirectUrl.searchParams.set('auth_error', 'missing_code');
    return applyCookies(NextResponse.redirect(redirectUrl));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let error: any = null;
    let tried: 'pkce' | 'otp' | 'pkce+otp' = tokenHash ? 'otp' : 'pkce';

    if (tokenHash) {
      // Cross-device magic-link / signup flow. Try the type from the
      // email template first; if Supabase rejects it, fall through to
      // a small set of sensible candidates. Different email templates
      // emit `.Type` as `signup`, `magiclink`, `email`, etc.
      const candidates: Array<'signup' | 'magiclink' | 'email' | 'invite' | 'recovery' | 'email_change'> = [];
      const typeRaw = typeParam?.toLowerCase() ?? '';
      if (typeRaw === 'signup' || typeRaw === 'magiclink' || typeRaw === 'email' || typeRaw === 'invite' || typeRaw === 'recovery' || typeRaw === 'email_change') {
        candidates.push(typeRaw);
      }
      for (const t of ['signup', 'magiclink', 'email'] as const) {
        if (!candidates.includes(t)) candidates.push(t);
      }
      for (const type of candidates) {
        const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        data = result.data;
        error = result.error;
        if (!error && result.data?.user) {
          break;
        }
        const debug = authDebugEnabled();
        console.warn('[auth/callback] verifyOtp failed', {
          tried_type: type,
          typeParam,
          status: error?.status,
          ...(debug ? { message: error?.message } : {}),
        });
      }
    } else {
      const result = await supabase.auth.exchangeCodeForSession(code!);
      data = result.data;
      error = result.error;
      if (error) {
        const debug = authDebugEnabled();
        console.warn('[auth/callback] exchangeCodeForSession failed', {
          status: error?.status,
          ...(debug ? { message: error?.message } : {}),
        });
        // PKCE exchange failed — code is probably not a PKCE UUID but
        // a token_hash coming through as ?code=. Try verifyOtp as a
        // last-ditch fallback before giving up.
        for (const t of ['signup', 'magiclink', 'email'] as const) {
          const otpResult = await supabase.auth.verifyOtp({ token_hash: code!, type: t });
          if (!otpResult.error && otpResult.data?.user) {
            data = otpResult.data;
            error = null;
            tried = 'pkce+otp';
            break;
          }
        }
      }
    }

    if (error || !data?.user) {
      console.warn('[auth/callback] all exchange attempts failed', { tried });
      redirectUrl.searchParams.set('auth_error', `exchange_failed_${tried}`);
      return applyCookies(NextResponse.redirect(redirectUrl));
    }

    const provider = typeof data.user.app_metadata?.provider === 'string' ? data.user.app_metadata.provider : null;
    const providerToken = (data.session as { provider_token?: string | null } | null)?.provider_token ?? null;
    let resolvedEmail = data.user.email?.trim() ?? null;

    if (provider === 'github' && (!resolvedEmail || isGithubNoreply(resolvedEmail)) && providerToken) {
      resolvedEmail = await resolveGithubPrimaryEmail(providerToken);
    }

    if (!resolvedEmail || (provider === 'github' && isGithubNoreply(resolvedEmail))) {
      redirectUrl.searchParams.set('auth_error', provider === 'github' ? 'github_email_required' : 'exchange_failed');
      return applyCookies(NextResponse.redirect(redirectUrl));
    }

    if (resolvedEmail !== data.user.email) {
      await upsertArenaIdentity({
        email: resolvedEmail,
        displayName:
          (typeof data.user.user_metadata?.display_name === 'string' ? data.user.user_metadata.display_name : null)
          ?? (typeof data.user.user_metadata?.full_name === 'string' ? data.user.user_metadata.full_name : null)
          ?? (typeof data.user.user_metadata?.name === 'string' ? data.user.user_metadata.name : null),
        authMethod: inferAuthMethodFromUser(data.user),
        authUserId: data.user.id,
        verified: true,
        issueApiToken: false,
        anonSessionToken,
      });
    } else {
      await syncArenaIdentityFromSupabaseUser(data.user, { issueApiToken: false, anonSessionToken });
    }

    redirectUrl.searchParams.set('auth', 'success');
    return applyCookies(NextResponse.redirect(redirectUrl));
  } catch (error) {
    console.error('[auth/callback] unexpected error:', error);
    redirectUrl.searchParams.set('auth_error', 'unexpected');
    return applyCookies(NextResponse.redirect(redirectUrl));
  }
}
