/**
 * GET /api/profile — Return the current Kolk Arena profile.
 * PATCH /api/profile — Update editable public profile fields.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ProfileInputSchema } from '@/lib/kolk/types';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { supabaseAdmin } from '@/lib/kolk/db';
import { countryCodeFromInput } from '@/lib/frontend/countries';
import { normalizePublicIdentity } from '@/lib/kolk/public-contract';
import { missingScopes, SCOPES, type Scope } from '@/lib/kolk/tokens';

// Normalize Vercel's `x-vercel-ip-country` header to an ISO-3166 alpha-2
// code or null. Keep this parser identical in shape to the one in the
// submit route so profile country + submission country_code agree.
function normalizeCountryCode(value: string | null | undefined) {
  return countryCodeFromInput(value);
}

function checkScopeOr401(
  ctx: Awaited<ReturnType<typeof resolveArenaAuthContext>>,
  required: Scope,
): NextResponse | null {
  if (!ctx) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }
  // Session caller: no scope check (human surface).
  if (ctx.scopes === null) return null;
  const missing = missingScopes(ctx.scopes, [required]);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `This Personal Access Token is missing the ${missing.join(', ')} scope.`,
        code: 'INSUFFICIENT_SCOPE',
        missing_scopes: missing,
      },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const ctx = await resolveArenaAuthContext(request);
  const scopeDenied = checkScopeOr401(ctx, SCOPES.READ_PROFILE);
  if (scopeDenied) return scopeDenied;
  const user = ctx!.user;

  // IP-based country default (2026-04-20 launch): if the player has
  // never set a country, seed it from Vercel's edge-attached
  // `x-vercel-ip-country` on first read and write-through so it sticks.
  // Explicit PATCH country values always override. The write-through is
  // fire-and-forget so a Supabase hiccup doesn't break profile reads.
  let resolvedCountry = normalizeCountryCode(user.country);
  if (!resolvedCountry) {
    const ipCountry = normalizeCountryCode(request.headers.get('x-vercel-ip-country'));
    if (ipCountry) {
      resolvedCountry = ipCountry;
      void supabaseAdmin
        .from('ka_users')
        .update({ country: ipCountry })
        .eq('id', user.id)
        .is('country', null);
    }
  } else if (resolvedCountry !== user.country) {
    void supabaseAdmin
      .from('ka_users')
      .update({ country: resolvedCountry })
      .eq('id', user.id);
  }

  return NextResponse.json({
    profile: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      handle: user.handle,
      ...normalizePublicIdentity({
        agent_stack: user.agent_stack,
        affiliation: user.affiliation,
      }),
      country: resolvedCountry,
      auth_methods: user.auth_methods ?? [],
      max_level: user.max_level,
      verified_at: user.verified_at,
      pioneer: user.pioneer === true,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = await resolveArenaAuthContext(request);
  const scopeDenied = checkScopeOr401(ctx, SCOPES.WRITE_PROFILE);
  if (scopeDenied) return scopeDenied;
  const user = ctx!.user;

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
    agent_stack: input.agentStack === undefined ? user.agent_stack : input.agentStack,
    affiliation: input.affiliation === undefined ? user.affiliation : input.affiliation,
    country: input.country === undefined ? normalizeCountryCode(user.country) ?? user.country : input.country,
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
      'agent_stack',
      'affiliation',
      'country',
      'auth_methods',
      'max_level',
      'verified_at',
      'pioneer',
    ].join(', '))
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to update profile', code: 'PROFILE_UPDATE_FAILED' },
      { status: 500 },
    );
  }

  const savedProfile = data as unknown as {
    id: string;
    email: string;
    display_name: string | null;
    handle: string | null;
    agent_stack: string | null;
    affiliation: string | null;
    country: string | null;
    auth_methods: string[] | null;
    max_level: number;
    verified_at: string | null;
    pioneer: boolean | null;
  };

  return NextResponse.json({
    profile: {
      ...savedProfile,
      ...normalizePublicIdentity({
        agent_stack: savedProfile.agent_stack,
        affiliation: savedProfile.affiliation,
      }),
    },
  });
}
