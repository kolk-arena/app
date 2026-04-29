/**
 * GET /api/session/quota — Read-only rate-limit + attemptToken quota
 *
 * Lets agents pre-check submit budget before burning a request:
 *   - perIdentityDay (Pacific-time bucket)
 *   - frozen state (5-hour safety freeze)
 *   - per-attemptToken minute/hour/retry windows when ?attemptToken=… is
 *     supplied AND the token belongs to the caller's identity
 *
 * Identity-scoped: anonymous cookie OR PAT/browser session. Tokens that
 * do not belong to the caller are silently treated as not-found rather
 * than returning a quota for a foreign identity.
 *
 * Pure read — does not claim or release any rate-limit slot. Server
 * failures during the read return 5xx without affecting quota state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyAnonTokenCookie, readAnonTokenCookie, resolveAnonToken } from '@/lib/kolk/auth';
import { resolveArenaAuthContext } from '@/lib/kolk/auth/server';
import { assertRuntimeSchemaReady, supabaseAdmin } from '@/lib/kolk/db';
import {
  buildSubmissionIdentity,
  readAttemptSubmitQuota,
  readIdentitySubmitQuota,
  type AttemptQuotaSnapshot,
  type IdentityQuotaSnapshot,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
  SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
} from '@/lib/kolk/submission-guards';

const QUOTA_SCHEMA_VERSION = 'kolk-quota.v1';

async function attemptTokenBelongsToIdentity(
  attemptToken: string,
  identity: { participantId: string | null; anonToken: string | null },
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('ka_challenge_sessions')
    .select('participant_id, anon_token')
    .eq('attempt_token', attemptToken)
    .maybeSingle();

  if (error || !data) return false;

  const sessionParticipantId = (data.participant_id as string | null | undefined) ?? null;
  const sessionAnonToken = (data.anon_token as string | null | undefined) ?? null;

  if (sessionParticipantId) {
    return identity.participantId !== null && identity.participantId === sessionParticipantId;
  }
  if (sessionAnonToken) {
    return identity.anonToken !== null && identity.anonToken === sessionAnonToken;
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    await assertRuntimeSchemaReady();
  } catch (error) {
    console.error('[session/quota] Runtime schema check failed:', error);
    return NextResponse.json(
      { error: 'Quota service is not ready. Apply the latest database migrations.', code: 'SCHEMA_NOT_READY' },
      { status: 503 },
    );
  }

  const arenaAuth = await resolveArenaAuthContext(request);
  const user = arenaAuth?.user;
  const isVerifiedUser = Boolean(arenaAuth && user?.is_verified);

  let participantId: string | null = null;
  let anonTokenForLookup: string | null = null;
  let identityEnvelope: Record<string, unknown>;
  let setAnonCookie: { token: string } | null = null;

  if (isVerifiedUser && user) {
    participantId = user.id;
    identityEnvelope = {
      mode: arenaAuth?.scopes === null ? 'browser_session' : 'bearer_token',
      display_name: user.display_name,
      handle: user.handle,
      is_verified: true,
    };
  } else {
    const anonState = resolveAnonToken(request);
    anonTokenForLookup = anonState.token;
    if (anonState.shouldSetCookie) setAnonCookie = { token: anonState.token };
    identityEnvelope = {
      mode: 'anonymous_cookie',
      same_session_required: true,
    };
  }

  const submissionIdentity = buildSubmissionIdentity({
    email: user?.email ?? null,
    userId: participantId,
    anonSessionToken: anonTokenForLookup ?? readAnonTokenCookie(request),
  });

  let identityQuota: IdentityQuotaSnapshot | null = null;
  if (submissionIdentity) {
    try {
      identityQuota = await readIdentitySubmitQuota(submissionIdentity);
    } catch (error) {
      console.error('[session/quota] Failed to read identity quota:', error);
      return NextResponse.json(
        { error: 'Failed to read identity quota', code: 'SESSION_QUOTA_ERROR' },
        { status: 500 },
      );
    }
  }

  let attemptQuota: AttemptQuotaSnapshot | null = null;
  const requestedAttemptToken = request.nextUrl.searchParams.get('attemptToken');
  if (requestedAttemptToken) {
    const ownsToken = await attemptTokenBelongsToIdentity(requestedAttemptToken, {
      participantId,
      anonToken: anonTokenForLookup,
    });
    if (ownsToken) {
      try {
        attemptQuota = await readAttemptSubmitQuota(requestedAttemptToken);
      } catch (error) {
        console.error('[session/quota] Failed to read attempt quota:', error);
        return NextResponse.json(
          { error: 'Failed to read attempt quota', code: 'SESSION_QUOTA_ERROR' },
          { status: 500 },
        );
      }
    }
  }

  const body: Record<string, unknown> = {
    schemaVersion: QUOTA_SCHEMA_VERSION,
    status: isVerifiedUser ? 'signed_in' : 'anonymous',
    identity: identityEnvelope,
    serverNowUtc: new Date().toISOString(),
    limits: {
      perAttemptTokenMinute: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
      perAttemptTokenHour: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
      perAttemptTokenRetry: SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
      perIdentityDay: SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
    },
    perIdentityDay: identityQuota
      ? {
          dayBucketPt: identityQuota.dayBucketPt,
          used: identityQuota.day.used,
          max: identityQuota.day.max,
          remaining: identityQuota.day.remaining,
          resetsAtUtc: identityQuota.resetsAtUtc,
          frozen: identityQuota.frozen,
          frozenUntil: identityQuota.frozenUntil,
          freezeReason: identityQuota.freezeReason,
        }
      : null,
    perAttemptToken: attemptQuota,
  };

  const response = NextResponse.json(body);
  if (setAnonCookie) {
    applyAnonTokenCookie(response, setAnonCookie.token);
  }
  return response;
}
