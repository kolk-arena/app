/**
 * GET /api/tokens/me — Introspect the credential used for this request.
 *
 * Returns either { kind: 'pat', ... } for PAT-authenticated callers
 * or { kind: 'session', ... } for session-cookie callers. The CLI's
 * `kolk-arena whoami` command relies on this to show the user's
 * identity and active scope set.
 *
 * See docs/API_TOKENS.md and docs/AUTH_DEVICE_FLOW.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/kolk/db';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import type { ApiTokenPublicView, ApiTokenRow } from '@/lib/kolk/tokens';
import { toPublicTokenView } from '@/lib/kolk/tokens';

export async function GET(request: NextRequest) {
  const ctx = await resolveArenaAuthContext(request);
  if (!ctx) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }

  const userView = {
    id: ctx.user.id,
    display_name: ctx.user.display_name,
    handle: ctx.user.handle,
    email: ctx.user.email,
  };

  if (ctx.scopes === null) {
    return NextResponse.json({
      kind: 'session' as const,
      user: userView,
    });
  }

  let tokenView: ApiTokenPublicView | null = null;
  if (ctx.apiTokenId) {
    const { data: tokenRowRaw } = await supabaseAdmin
      .from('ka_api_tokens')
      .select('*')
      .eq('id', ctx.apiTokenId)
      .maybeSingle();
    const tokenRow = tokenRowRaw as ApiTokenRow | null;
    tokenView = tokenRow ? toPublicTokenView(tokenRow) : null;
  }

  return NextResponse.json({
    kind: 'pat' as const,
    user: userView,
    scopes: ctx.scopes,
    token: tokenView,
  });
}
