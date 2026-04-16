/**
 * POST /api/auth/verify — Verify Supabase email OTP and issue Kolk Arena API token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/kolk/db';
import { VerifyInputSchema } from '@/lib/kolk/types';
import { syncArenaIdentityFromSupabaseUser } from '@/lib/kolk/auth/server';
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

  const parsed = VerifyInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  try {
    const { supabase, applyCookies } = createRouteHandlerSupabaseClient(request);

    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(parsed.data.email),
      token: parsed.data.code,
      type: 'email',
    });

    if (error || !data.user?.email) {
      return NextResponse.json(
        { error: error?.message ?? 'Verification failed', code: 'VERIFY_FAILED' },
        { status: 401 },
      );
    }

    const synced = await syncArenaIdentityFromSupabaseUser(data.user, {
      issueApiToken: true,
    });

    const response = NextResponse.json({
      message: 'Email verified successfully',
      token: synced.apiToken,
      user: {
        id: synced.user.id,
        email: synced.user.email,
        display_name: synced.user.display_name,
        school: synced.user.school,
        max_level: synced.user.max_level,
        auth_methods: synced.user.auth_methods ?? [],
      },
      usage: {
        header: synced.apiToken ? `Authorization: Bearer ${synced.apiToken}` : null,
        alternative: synced.apiToken ? `X-Kolk-Token: ${synced.apiToken}` : null,
      },
    });

    return applyCookies(response);
  } catch (error) {
    console.error('[auth/verify] unexpected error:', error);
    return NextResponse.json(
      { error: 'Verification failed', code: 'VERIFY_FAILED' },
      { status: 500 },
    );
  }
}
