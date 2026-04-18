/**
 * DELETE /api/tokens/:id — Revoke a Personal Access Token.
 *
 * Human-surface only. Idempotent: deleting an already-revoked token
 * returns 200. Returns 404 if the token does not belong to the caller.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/kolk/db';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await resolveArenaAuthContext(request);
  if (!ctx) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }
  if (ctx.scopes !== null) {
    return NextResponse.json(
      { error: 'Token management endpoints require a human session, not a PAT.', code: 'PAT_NOT_ALLOWED' },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { error: 'Missing token id', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const { data: existingRaw } = await supabaseAdmin
    .from('ka_api_tokens')
    .select('id, user_id, revoked_at')
    .eq('id', id)
    .maybeSingle();

  const existing = existingRaw as { id: string; user_id: string; revoked_at: string | null } | null;

  if (!existing || existing.user_id !== ctx.user.id) {
    return NextResponse.json(
      { error: 'Token not found', code: 'TOKEN_NOT_FOUND' },
      { status: 404 },
    );
  }

  if (existing.revoked_at) {
    return NextResponse.json({ id: existing.id, revoked_at: existing.revoked_at });
  }

  const revokedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('ka_api_tokens')
    .update({ revoked_at: revokedAt })
    .eq('id', id);

  if (updateError) {
    console.error('[tokens] revoke error', updateError);
    return NextResponse.json(
      { error: 'Failed to revoke token', code: 'TOKEN_REVOKE_FAILED' },
      { status: 500 },
    );
  }

  return NextResponse.json({ id, revoked_at: revokedAt });
}
