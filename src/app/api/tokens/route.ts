/**
 * /api/tokens — Personal Access Token collection endpoint.
 *
 * POST  — create a new PAT (shown in plaintext exactly once)
 * GET   — list the authenticated user's non-revoked PATs
 *
 * Human-surface only: these endpoints refuse PAT-authenticated callers
 * (you cannot use a PAT to mint or revoke other PATs). See docs/API_TOKENS.md.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/kolk/db';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import {
  generateRawToken,
  hashToken,
  normalizeScopes,
  tokenPrefix,
  toPublicTokenView,
  type ApiTokenRow,
  type ClientKind,
} from '@/lib/kolk/tokens';

const CreateTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string().min(1)).min(1, 'At least one scope is required'),
  expires_at: z.string().datetime().optional().nullable(),
  client_kind: z.enum(['cli', 'web', 'device', 'other']).optional(),
});

function humanSessionOnly(ctx: Awaited<ReturnType<typeof resolveArenaAuthContext>>): NextResponse | null {
  if (!ctx) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }
  if (ctx.scopes !== null) {
    // Authenticated via PAT — refused for token management endpoints.
    return NextResponse.json(
      { error: 'Token management endpoints require a human session, not a PAT.', code: 'PAT_NOT_ALLOWED' },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  const ctx = await resolveArenaAuthContext(request);
  const blocked = humanSessionOnly(ctx);
  if (blocked) return blocked;
  const userId = ctx!.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const parsed = CreateTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const { valid: validScopes, unknown: unknownScopes } = normalizeScopes(parsed.data.scopes);
  if (unknownScopes.length > 0) {
    return NextResponse.json(
      {
        error: `Unknown scopes: ${unknownScopes.join(', ')}`,
        code: 'UNKNOWN_SCOPE',
        unknown_scopes: unknownScopes,
      },
      { status: 400 },
    );
  }
  if (validScopes.length === 0) {
    return NextResponse.json(
      { error: 'At least one scope is required', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const expiresAt = parsed.data.expires_at ?? null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'expires_at must be in the future', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const rawToken = generateRawToken();
  const tokenHashValue = hashToken(rawToken);
  const clientKind: ClientKind = parsed.data.client_kind ?? 'cli';

  const { data: insertedRaw, error: insertError } = await supabaseAdmin
    .from('ka_api_tokens')
    .insert({
      user_id: userId,
      name: parsed.data.name,
      token_hash: tokenHashValue,
      token_prefix: tokenPrefix(rawToken),
      scopes: validScopes,
      client_kind: clientKind,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (insertError || !insertedRaw) {
    console.error('[tokens] insert error', insertError);
    return NextResponse.json(
      { error: 'Failed to create token', code: 'TOKEN_CREATE_FAILED' },
      { status: 500 },
    );
  }

  const inserted = insertedRaw as ApiTokenRow;
  const publicView = toPublicTokenView(inserted);

  // Raw token is returned exactly once. Never stored. Never re-displayed.
  return NextResponse.json(
    {
      token: rawToken,
      ...publicView,
    },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  const ctx = await resolveArenaAuthContext(request);
  const blocked = humanSessionOnly(ctx);
  if (blocked) return blocked;
  const userId = ctx!.user.id;

  const { data: rowsRaw, error } = await supabaseAdmin
    .from('ka_api_tokens')
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[tokens] list error', error);
    return NextResponse.json(
      { error: 'Failed to list tokens', code: 'TOKEN_LIST_FAILED' },
      { status: 500 },
    );
  }

  const rows = (rowsRaw ?? []) as ApiTokenRow[];
  return NextResponse.json({
    tokens: rows.map(toPublicTokenView),
  });
}
