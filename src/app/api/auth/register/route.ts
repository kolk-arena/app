/**
 * POST /api/auth/register — Start ordinary email login with Supabase Auth.
 *
 * This sends the Supabase email OTP / magic link flow.
 * Canonical identity still lives in ka_users keyed by normalized email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RegisterInputSchema } from '@/lib/kolk/types';
import { createRouteHandlerSupabaseClient } from '@/lib/kolk/db';
import { getAppUrl, sanitizeNextPath, upsertArenaIdentity } from '@/lib/kolk/auth/server';
import { normalizeEmail } from '@/lib/kolk/auth';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const parsed = RegisterInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const displayName = parsed.data.displayName?.trim() || null;
  const nextPath = sanitizeNextPath(parsed.data.nextPath);

  try {
    const { supabase, applyCookies } = createRouteHandlerSupabaseClient(request);

    await upsertArenaIdentity({
      email,
      displayName,
      authMethod: 'email',
      verified: false,
      issueApiToken: false,
    });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${getAppUrl(request)}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
        data: displayName ? { display_name: displayName } : undefined,
      },
    });

    if (error) {
      console.error('[auth/register] signInWithOtp failed:', error.message);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.', code: 'AUTH_REGISTER_FAILED' },
        { status: 400 },
      );
    }

    const response = NextResponse.json({
      status: 'verification_pending',
      email,
      display_name: displayName ?? email.split('@')[0],
      message: 'Check your email for the verification code or sign-in link.',
    });

    return applyCookies(response);
  } catch (error) {
    console.error('[auth/register] unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to start email login', code: 'AUTH_REGISTER_FAILED' },
      { status: 500 },
    );
  }
}
