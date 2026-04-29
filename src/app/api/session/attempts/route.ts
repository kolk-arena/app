import { NextRequest, NextResponse } from 'next/server';
import { assertRuntimeSchemaReady } from '@/lib/kolk/db';
import { applyAnonTokenCookie, resolveAnonToken } from '@/lib/kolk/auth';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { fetchSessionAttemptsForIdentity } from '@/lib/kolk/session-attempts';

export async function GET(request: NextRequest) {
  try {
    await assertRuntimeSchemaReady();
  } catch (error) {
    console.error('[session/attempts] Runtime schema check failed:', error);
    return NextResponse.json(
      { error: 'Session recovery service is not ready. Apply the latest database migrations.', code: 'SCHEMA_NOT_READY' },
      { status: 503 },
    );
  }

  const arenaAuth = await resolveArenaAuthContext(request);
  const user = arenaAuth?.user;

  if (arenaAuth && user?.is_verified) {
    try {
      const attempts = await fetchSessionAttemptsForIdentity({ participantId: user.id });
      return NextResponse.json({
        status: 'signed_in',
        identity: {
          mode: arenaAuth.scopes === null ? 'browser_session' : 'bearer_token',
          display_name: user.display_name,
          handle: user.handle,
          is_verified: true,
        },
        attempts,
      });
    } catch (error) {
      console.error('[session/attempts] Failed to fetch signed-in attempts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch session attempts', code: 'SESSION_ATTEMPTS_ERROR' },
        { status: 500 },
      );
    }
  }

  const anonState = resolveAnonToken(request);
  let attempts;
  try {
    attempts = await fetchSessionAttemptsForIdentity({ anonToken: anonState.token });
  } catch (error) {
    console.error('[session/attempts] Failed to fetch anonymous attempts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session attempts', code: 'SESSION_ATTEMPTS_ERROR' },
      { status: 500 },
    );
  }

  const response = NextResponse.json({
    status: 'anonymous',
    identity: {
      mode: 'anonymous_cookie',
      same_session_required: true,
    },
    attempts,
  });

  if (anonState.shouldSetCookie) {
    applyAnonTokenCookie(response, anonState.token);
  }

  return response;
}
