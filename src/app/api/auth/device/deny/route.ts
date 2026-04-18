import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/kolk/db';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { normalizeUserCode } from '@/lib/kolk/device-flow';
import { assertSameOrigin } from '@/lib/kolk/http/origin';

// Proof-of-knowledge requirement: both user_code (human-visible, 2^40 entropy)
// AND device_code (40-char base62, ~2^238 entropy) must match the same row.
// This blocks a signed-in malicious user from enumerating user_codes and
// denying legit CLI login flows; only the browser tab that loaded the real
// /device?code=X page (which read device_code server-side) can submit a deny.
const DenyDeviceCodeSchema = z.object({
  user_code: z.string().trim().min(1),
  device_code: z.string().trim().min(1),
});

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const parsed = DenyDeviceCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const userCode = normalizeUserCode(parsed.data.user_code);
  const { data: rowRaw } = await supabaseAdmin
    .from('ka_device_codes')
    .select('device_code, verified_at, denied_at')
    .eq('user_code', userCode)
    .maybeSingle();

  const row = rowRaw as { device_code: string; verified_at: string | null; denied_at: string | null } | null;
  if (!row) {
    return NextResponse.json(
      { error: 'Device code not found', code: 'DEVICE_CODE_NOT_FOUND' },
      { status: 404 },
    );
  }

  // Constant-time-ish mismatch rejection. We still return 404 (same shape as
  // "not found") so an attacker cannot distinguish "wrong device_code" from
  // "user_code never existed" via timing or status code.
  if (row.device_code !== parsed.data.device_code) {
    return NextResponse.json(
      { error: 'Device code not found', code: 'DEVICE_CODE_NOT_FOUND' },
      { status: 404 },
    );
  }

  if (row.verified_at) {
    return NextResponse.json(
      { error: 'This request is already authorized.', code: 'DEVICE_CODE_ALREADY_VERIFIED' },
      { status: 409 },
    );
  }

  if (!row.denied_at) {
    await supabaseAdmin
      .from('ka_device_codes')
      .update({ denied_at: new Date().toISOString() })
      .eq('device_code', row.device_code);
  }

  return NextResponse.json({ success: true });
}
