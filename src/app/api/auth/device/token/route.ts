import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/kolk/db';
import {
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEVICE_FLOW_CLIENT_ID,
  MIN_POLL_INTERVAL_SECONDS,
} from '@/lib/kolk/device-flow';

const DeviceTokenRequestSchema = z.object({
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:device_code'),
  device_code: z.string().trim().min(1),
  client_id: z.string().trim().min(1),
});

type DeviceCodeRow = {
  device_code: string;
  requested_scopes: string[] | null;
  granted_scopes: string[] | null;
  issued_token_id: string | null;
  issued_access_token: string | null;
  verified_at: string | null;
  denied_at: string | null;
  expires_at: string;
  last_polled_at: string | null;
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const parsed = DeviceTokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  if (parsed.data.client_id !== DEVICE_FLOW_CLIENT_ID) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
  }

  const { data: rowRaw } = await supabaseAdmin
    .from('ka_device_codes')
    .select('device_code, requested_scopes, granted_scopes, issued_token_id, issued_access_token, verified_at, denied_at, expires_at, last_polled_at')
    .eq('device_code', parsed.data.device_code)
    .maybeSingle();

  const row = (rowRaw ?? null) as DeviceCodeRow | null;
  if (!row) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }

  const now = new Date();
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return NextResponse.json({ error: 'expired_token' }, { status: 400 });
  }

  if (row.denied_at) {
    return NextResponse.json({ error: 'access_denied' }, { status: 400 });
  }

  if (row.verified_at && row.issued_token_id && row.issued_access_token) {
    const { data: tokenRaw } = await supabaseAdmin
      .from('ka_api_tokens')
      .select('id, expires_at')
      .eq('id', row.issued_token_id)
      .maybeSingle();

    if (!tokenRaw) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
    }

    await supabaseAdmin
      .from('ka_device_codes')
      .update({
        issued_access_token: null,
        last_polled_at: now.toISOString(),
      })
      .eq('device_code', row.device_code);

    return NextResponse.json({
      access_token: row.issued_access_token,
      token_type: 'Bearer',
      scope: (row.granted_scopes ?? []).join(' '),
      expires_at: tokenRaw.expires_at,
      token_id: tokenRaw.id,
    });
  }

  const lastPolledAt = row.last_polled_at ? new Date(row.last_polled_at).getTime() : null;
  if (lastPolledAt && now.getTime() - lastPolledAt < MIN_POLL_INTERVAL_SECONDS * 1000) {
    return NextResponse.json(
      {
        error: 'slow_down',
        interval: DEFAULT_POLL_INTERVAL_SECONDS + MIN_POLL_INTERVAL_SECONDS,
      },
      { status: 400 },
    );
  }

  await supabaseAdmin
    .from('ka_device_codes')
    .update({ last_polled_at: now.toISOString() })
    .eq('device_code', row.device_code);

  return NextResponse.json({ error: 'authorization_pending' }, { status: 400 });
}
