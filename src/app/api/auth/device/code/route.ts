import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/kolk/db';
import { getAppUrl } from '@/lib/kolk/auth/server';
import {
  defaultDeviceScopes,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEVICE_CODE_TTL_SECONDS,
  DEVICE_FLOW_CLIENT_ID,
  generateDeviceCode,
  generateUserCode,
} from '@/lib/kolk/device-flow';
import { normalizeScopes } from '@/lib/kolk/tokens';
import { createIpRateLimiter, getClientIp } from '@/lib/kolk/rate-limit';

const DeviceCodeRequestSchema = z.object({
  client_id: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).optional(),
});

// RFC 8628 device flow is unauthenticated by design. Without this guard a
// single IP could flood `ka_device_codes` with orphaned rows. 10/min/IP
// fits legitimate CLI retries (plus the poll loop) comfortably.
const RATE_LIMITER = createIpRateLimiter({ windowMs: 60_000, maxPerWindow: 10 });

export async function POST(request: NextRequest) {
  if (!RATE_LIMITER.check(getClientIp(request))) {
    return NextResponse.json(
      { error: 'Too many device-code requests from this IP. Try again in a minute.', code: 'RATE_LIMITED' },
      { status: 429 },
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

  const parsed = DeviceCodeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  if (parsed.data.client_id !== DEVICE_FLOW_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Unknown client_id', code: 'invalid_client' },
      { status: 400 },
    );
  }

  const requestedScopes = parsed.data.scopes?.length ? parsed.data.scopes : defaultDeviceScopes();
  const { valid, unknown } = normalizeScopes(requestedScopes);
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error: `Unknown scopes: ${unknown.join(', ')}`,
        code: 'UNKNOWN_SCOPE',
        unknown_scopes: unknown,
      },
      { status: 400 },
    );
  }

  if (valid.length === 0) {
    return NextResponse.json(
      { error: 'At least one scope is required', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEVICE_CODE_TTL_SECONDS * 1000).toISOString();

  let inserted = false;
  let deviceCode = '';
  let userCode = '';
  let lastError: unknown = null;

  for (let i = 0; i < 5; i += 1) {
    deviceCode = generateDeviceCode();
    userCode = generateUserCode();

    const { error } = await supabaseAdmin.from('ka_device_codes').insert({
      device_code: deviceCode,
      user_code: userCode,
      requested_scopes: valid,
      granted_scopes: [],
      client_kind: 'cli',
      expires_at: expiresAt,
    });

    if (!error) {
      inserted = true;
      break;
    }

    lastError = error;
  }

  if (!inserted) {
    console.error('[device/code] insert failed', lastError);
    return NextResponse.json(
      { error: 'Failed to create device flow request', code: 'DEVICE_FLOW_CREATE_FAILED' },
      { status: 500 },
    );
  }

  const verificationUri = `${getAppUrl(request)}/device`;

  return NextResponse.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: DEFAULT_POLL_INTERVAL_SECONDS,
  });
}
