import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/kolk/db';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { deviceTokenExpiresAt, normalizeUserCode } from '@/lib/kolk/device-flow';
import { assertSameOrigin } from '@/lib/kolk/http/origin';
import {
  generateRawToken,
  hashToken,
  normalizeScopes,
  tokenPrefix,
} from '@/lib/kolk/tokens';

// Proof-of-knowledge: both user_code and device_code must match the same
// ka_device_codes row. device_code (~2^238) is not enumerable so this blocks
// a CSRF attacker who only knows (or guesses) a user_code.
const VerifyDeviceCodeSchema = z.object({
  user_code: z.string().trim().min(1),
  device_code: z.string().trim().min(1),
  granted_scopes: z.array(z.string().trim().min(1)).min(1, 'Pick at least one scope'),
});

type DeviceCodeRow = {
  device_code: string;
  user_code: string;
  requested_scopes: string[] | null;
  granted_scopes: string[] | null;
  verified_at: string | null;
  denied_at: string | null;
  expires_at: string;
  issued_token_id: string | null;
};

export async function POST(request: NextRequest) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const ctx = await resolveArenaAuthContext(request);
  if (!ctx) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'AUTH_REQUIRED' },
      { status: 401 },
    );
  }
  if (ctx.scopes !== null) {
    return NextResponse.json(
      { error: 'Device verification requires a browser session, not a PAT.', code: 'PAT_NOT_ALLOWED' },
      { status: 403 },
    );
  }
  if (!ctx.user.is_verified) {
    return NextResponse.json(
      { error: 'Sign in with a verified Kolk Arena account before authorizing a CLI.', code: 'AUTH_REQUIRED' },
      { status: 403 },
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

  const parsed = VerifyDeviceCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const userCode = normalizeUserCode(parsed.data.user_code);
  const { data: rowRaw } = await supabaseAdmin
    .from('ka_device_codes')
    .select('device_code, user_code, requested_scopes, granted_scopes, verified_at, denied_at, expires_at, issued_token_id')
    .eq('user_code', userCode)
    .maybeSingle();

  const row = (rowRaw ?? null) as DeviceCodeRow | null;
  if (!row) {
    return NextResponse.json(
      { error: 'Device code not found', code: 'DEVICE_CODE_NOT_FOUND' },
      { status: 404 },
    );
  }

  if (row.device_code !== parsed.data.device_code) {
    return NextResponse.json(
      { error: 'Device code not found', code: 'DEVICE_CODE_NOT_FOUND' },
      { status: 404 },
    );
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This code has expired.', code: 'expired_token' }, { status: 400 });
  }
  if (row.denied_at) {
    return NextResponse.json({ error: 'This request was already cancelled.', code: 'access_denied' }, { status: 400 });
  }
  if (row.verified_at || row.issued_token_id) {
    return NextResponse.json({ error: 'This request was already authorized.', code: 'DEVICE_CODE_ALREADY_VERIFIED' }, { status: 409 });
  }

  const { valid, unknown } = normalizeScopes(parsed.data.granted_scopes);
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Unknown scopes: ${unknown.join(', ')}`, code: 'UNKNOWN_SCOPE' },
      { status: 400 },
    );
  }

  const requested = new Set(row.requested_scopes ?? []);
  const invalidGrant = valid.filter((scope) => !requested.has(scope));
  if (invalidGrant.length > 0) {
    return NextResponse.json(
      { error: `Cannot grant unrequested scopes: ${invalidGrant.join(', ')}`, code: 'INVALID_SCOPE_GRANT' },
      { status: 400 },
    );
  }

  const rawToken = generateRawToken();
  const now = new Date().toISOString();
  const expiresAt = deviceTokenExpiresAt();

  const { data: tokenRowRaw, error: insertError } = await supabaseAdmin
    .from('ka_api_tokens')
    .insert({
      user_id: ctx.user.id,
      name: `Kolk Arena CLI (${userCode})`,
      token_hash: hashToken(rawToken),
      token_prefix: tokenPrefix(rawToken),
      scopes: valid,
      client_kind: 'device',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insertError || !tokenRowRaw) {
    console.error('[device/verify] token insert error', insertError);
    return NextResponse.json(
      { error: 'Failed to issue device-flow token', code: 'TOKEN_CREATE_FAILED' },
      { status: 500 },
    );
  }

  // Non-atomic across two tables: we just inserted into ka_api_tokens, and
  // now we link the device_code row. If THIS update fails — or succeeds but
  // the guard .is('verified_at', null) matches zero rows because a concurrent
  // verify already ran — we must compensate by revoking the token we just
  // minted. Otherwise we leave a live kat_ token with no device_code binding
  // that the CLI can never retrieve.
  const { error: updateError, count: updatedCount } = await supabaseAdmin
    .from('ka_device_codes')
    .update(
      {
        user_id: ctx.user.id,
        granted_scopes: valid,
        verified_at: now,
        issued_token_id: tokenRowRaw.id,
        issued_access_token: rawToken,
      },
      { count: 'exact' },
    )
    .eq('device_code', row.device_code)
    .is('verified_at', null)
    .is('denied_at', null);

  if (updateError || !updatedCount || updatedCount === 0) {
    console.error('[device/verify] device-code update failed; compensating by revoking orphan token', {
      updateError,
      updatedCount,
      tokenId: tokenRowRaw.id,
    });
    // Best-effort compensating revoke. Even if this also fails, the token
    // still has its own expires_at and can be handled by operator cleanup.
    await supabaseAdmin
      .from('ka_api_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenRowRaw.id)
      .is('revoked_at', null);

    const alreadyFinalized = !updateError && updatedCount === 0;
    return NextResponse.json(
      {
        error: alreadyFinalized
          ? 'This request has already been authorized or cancelled from another tab. Start a new `kolk-arena login`.'
          : 'Failed to finalize device-flow authorization. No token was issued; please try again.',
        code: alreadyFinalized ? 'DEVICE_CODE_ALREADY_VERIFIED' : 'DEVICE_VERIFY_FAILED',
      },
      { status: alreadyFinalized ? 409 : 500 },
    );
  }

  return NextResponse.json({
    success: true,
    issued_token_id: tokenRowRaw.id,
    granted_scopes: valid,
  });
}
