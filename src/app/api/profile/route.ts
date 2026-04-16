/**
 * GET /api/profile — Return the current Kolk Arena profile.
 * PATCH /api/profile — Update editable public profile fields.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ProfileInputSchema } from '@/lib/kolk/types';
import { resolveArenaUserFromRequest } from '@/lib/kolk/auth/server';
import { supabaseAdmin } from '@/lib/kolk/db';

export async function GET(request: NextRequest) {
  const user = await resolveArenaUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  return NextResponse.json({
    profile: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      handle: user.handle,
      framework: user.framework,
      school: user.school,
      country: user.country,
      auth_methods: user.auth_methods ?? [],
      max_level: user.max_level,
      verified_at: user.verified_at,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const user = await resolveArenaUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const parsed = ProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const payload = {
    display_name: input.displayName ?? user.display_name,
    handle: input.handle === undefined ? user.handle : input.handle,
    framework: input.framework === undefined ? user.framework : input.framework,
    school: input.school === undefined ? user.school : input.school,
    country: input.country === undefined ? user.country : input.country,
  };

  const { data, error } = await supabaseAdmin
    .from('ka_users')
    .update(payload)
    .eq('id', user.id)
    .select([
      'id',
      'email',
      'display_name',
      'handle',
      'framework',
      'school',
      'country',
      'auth_methods',
      'max_level',
      'verified_at',
    ].join(', '))
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to update profile', code: 'PROFILE_UPDATE_FAILED' },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile: data });
}
