import { hashCode, normalizeEmail } from '@/lib/kolk/auth';
import {
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
  SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
} from '@/lib/kolk/beta-contract';
import { supabaseAdmin } from '@/lib/kolk/db';

const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

export {
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
  SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
  SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
};

type RpcClaimAttemptRow = {
  allowed: boolean;
  code: string | null;
  retry_after_seconds: number | null;
  minute_used: number | null;
  minute_max: number | null;
  hour_used: number | null;
  hour_max: number | null;
  retry_count: number | null;
  retry_max: number | null;
};

type RpcClaimIdentityRow = {
  allowed: boolean;
  code: string | null;
  retry_after_seconds: number | null;
  day_used: number | null;
  day_max: number | null;
  frozen_until: string | null;
  reason: string | null;
  minute_used: number | null;
  minute_threshold: number | null;
  five_min_used: number | null;
  five_min_threshold: number | null;
};

export type SubmissionIdentity =
  | {
      kind: 'user';
      keyHash: string;
      userId: string;
      email: string;
    }
  | {
      kind: 'anon';
      keyHash: string;
      anonSessionToken: string;
    };

export type IdentityLimitAllowed = {
  allowed: true;
  dayBucketPt: string;
  day: {
    used: number;
    max: number;
  };
};

export type IdentityLimitBlocked = {
  allowed: false;
  code: 'ACCOUNT_FROZEN' | 'RATE_LIMIT_DAY';
  dayBucketPt: string;
  retryAfterSeconds: number;
  frozenUntil?: string;
  reason?: string;
  day: {
    used: number;
    max: number;
  };
  windows?: {
    minuteUsed: number;
    minuteThreshold: number;
    fiveMinUsed: number;
    fiveMinThreshold: number;
  };
};

export type IdentityLimitResult = IdentityLimitAllowed | IdentityLimitBlocked;

export type AttemptLimitAllowed = {
  allowed: true;
  minute: {
    used: number;
    max: number;
  };
  hour: {
    used: number;
    max: number;
  };
  retry: {
    used: number;
    max: number;
  };
};

export type AttemptLimitBlocked = {
  allowed: false;
  code: 'RATE_LIMIT_MINUTE' | 'RATE_LIMIT_HOUR' | 'RETRY_LIMIT_EXCEEDED';
  retryAfterSeconds: number;
  minute: {
    used: number;
    max: number;
  };
  hour: {
    used: number;
    max: number;
  };
  retry: {
    used: number;
    max: number;
  };
};

export type AttemptLimitResult = AttemptLimitAllowed | AttemptLimitBlocked;

function coercePositiveInt(value: number | null | undefined, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value ?? NaN);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

export function getPacificDayBucket(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(now);
}

export function buildSubmissionIdentity(input: {
  email?: string | null;
  userId?: string | null;
  anonSessionToken?: string | null;
}): SubmissionIdentity | null {
  if (input.email && input.userId) {
    const normalizedEmail = normalizeEmail(input.email);
    return {
      kind: 'user',
      keyHash: hashCode(`email:${normalizedEmail}`),
      userId: input.userId,
      email: normalizedEmail,
    };
  }

  if (input.anonSessionToken) {
    return {
      kind: 'anon',
      keyHash: hashCode(`anon:${input.anonSessionToken}`),
      anonSessionToken: input.anonSessionToken,
    };
  }

  return null;
}

export async function claimIdentitySubmitAttempt(identity: SubmissionIdentity): Promise<IdentityLimitResult> {
  const dayBucketPt = getPacificDayBucket();
  const { data, error } = await supabaseAdmin.rpc('ka_claim_identity_submit_attempt', {
    p_identity_key: identity.keyHash,
    p_identity_kind: identity.kind,
    p_user_id: identity.kind === 'user' ? identity.userId : null,
    p_day_bucket_pt: dayBucketPt,
    p_day_limit: SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY,
  });

  if (error) {
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcClaimIdentityRow | null;
  const dayUsed = coercePositiveInt(row?.day_used, 0);
  const dayMax = coercePositiveInt(row?.day_max, SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY);

  if (!row || row.allowed !== false || !row.code) {
    return {
      allowed: true,
      dayBucketPt,
      day: {
        used: dayUsed,
        max: dayMax,
      },
    };
  }

  if (row.code === 'ACCOUNT_FROZEN') {
    return {
      allowed: false,
      code: 'ACCOUNT_FROZEN',
      dayBucketPt,
      retryAfterSeconds: coercePositiveInt(row.retry_after_seconds, 5 * 60 * 60),
      frozenUntil: row.frozen_until ?? undefined,
      reason: row.reason ?? undefined,
      day: {
        used: dayUsed,
        max: dayMax,
      },
      windows: {
        minuteUsed: coercePositiveInt(row.minute_used, 0),
        minuteThreshold: coercePositiveInt(row.minute_threshold, 20),
        fiveMinUsed: coercePositiveInt(row.five_min_used, 0),
        fiveMinThreshold: coercePositiveInt(row.five_min_threshold, 30),
      },
    };
  }

  return {
    allowed: false,
    code: 'RATE_LIMIT_DAY',
    dayBucketPt,
    retryAfterSeconds: coercePositiveInt(row.retry_after_seconds, 60),
    day: {
      used: dayUsed,
      max: dayMax,
    },
  };
}

export async function claimAttemptSubmitSlot(attemptToken: string): Promise<AttemptLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('ka_claim_attempt_submit_slot', {
    p_attempt_token: attemptToken,
    p_minute_limit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE,
    p_hour_limit: SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR,
    p_retry_cap: SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN,
  });

  if (error) {
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcClaimAttemptRow | null;
  const minuteUsed = coercePositiveInt(row?.minute_used, 0);
  const minuteMax = coercePositiveInt(row?.minute_max, SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE);
  const hourUsed = coercePositiveInt(row?.hour_used, 0);
  const hourMax = coercePositiveInt(row?.hour_max, SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR);
  const retryUsed = coercePositiveInt(row?.retry_count, 0);
  const retryMax = coercePositiveInt(row?.retry_max, SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN);

  if (!row || row.allowed !== false || !row.code) {
    return {
      allowed: true,
      minute: {
        used: minuteUsed,
        max: minuteMax,
      },
      hour: {
        used: hourUsed,
        max: hourMax,
      },
      retry: {
        used: retryUsed,
        max: retryMax,
      },
    };
  }

  return {
    allowed: false,
    code:
      row.code === 'RATE_LIMIT_HOUR'
        ? 'RATE_LIMIT_HOUR'
        : row.code === 'RETRY_LIMIT_EXCEEDED'
        ? 'RETRY_LIMIT_EXCEEDED'
        : 'RATE_LIMIT_MINUTE',
    retryAfterSeconds: coercePositiveInt(row.retry_after_seconds, 60),
    minute: {
      used: minuteUsed,
      max: minuteMax,
    },
    hour: {
      used: hourUsed,
      max: hourMax,
    },
    retry: {
      used: retryUsed,
      max: retryMax,
    },
  };
}

// ---------------------------------------------------------------------------
// Release: undo a claim when the submit returns 5xx. Server-side failures
// must not count against the player's rate-limit quota. See migration
// 00016_submit_guard_refund.sql for the RPC definitions.
//
// Both release functions are best-effort: a failure here must NEVER mask
// the original 5xx response. We log and swallow so callers can use them as
// fire-and-forget cleanup in error paths.
// ---------------------------------------------------------------------------

export async function releaseAttemptSubmitSlot(attemptToken: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('ka_release_attempt_submit_slot', {
      p_attempt_token: attemptToken,
    });
    if (error) {
      console.error('[submission-guards] releaseAttemptSubmitSlot failed', error);
    }
  } catch (err) {
    console.error('[submission-guards] releaseAttemptSubmitSlot threw', err);
  }
}

export async function releaseIdentitySubmitAttempt(
  identity: SubmissionIdentity,
  dayBucketPt: string = getPacificDayBucket(),
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('ka_release_identity_submit_attempt', {
      p_identity_key: identity.keyHash,
      p_day_bucket_pt: dayBucketPt,
    });
    if (error) {
      console.error('[submission-guards] releaseIdentitySubmitAttempt failed', error);
    }
  } catch (err) {
    console.error('[submission-guards] releaseIdentitySubmitAttempt threw', err);
  }
}

// ---------------------------------------------------------------------------
// Read-only quota snapshots. Power GET /api/session/quota so agents can
// pre-check rate-limit state without claiming a slot. Both helpers query
// the same tables that the claim/release RPCs maintain (so refunds from
// 5xx are reflected). Pure reads — never mutate.
// ---------------------------------------------------------------------------

export type IdentityQuotaSnapshot = {
  dayBucketPt: string;
  day: { used: number; max: number; remaining: number };
  frozen: boolean;
  frozenUntil: string | null;
  freezeReason: string | null;
  /** UTC instant at which the day counter resets (next Pacific midnight). */
  resetsAtUtc: string;
};

export type AttemptQuotaSnapshot = {
  attemptToken: string;
  level: number | null;
  challengeStartedAtUtc: string | null;
  deadlineUtc: string | null;
  expired: boolean;
  consumedAt: string | null;
  minute: { used: number; max: number; remaining: number };
  hour: { used: number; max: number; remaining: number };
  retry: { used: number; max: number; remaining: number };
};

function countTimestampsWithin(timestampsMs: unknown, windowMs: number, nowMs: number): number {
  if (!Array.isArray(timestampsMs)) return 0;
  const cutoff = nowMs - windowMs;
  let count = 0;
  for (const value of timestampsMs) {
    const epoch = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(epoch) && epoch > cutoff) count += 1;
  }
  return count;
}

function nextPacificMidnightUtc(now: Date): string {
  // Format the current Pacific date, then build the next-day ISO at the
  // PT-midnight boundary expressed in UTC. Pacific is either UTC-8 (PST)
  // or UTC-7 (PDT); we let JS resolve the offset by constructing through
  // Date with the formatted parts.
  const dayBucket = getPacificDayBucket(now); // YYYY-MM-DD
  const [y, m, d] = dayBucket.split('-').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  // Tomorrow at PT-midnight. Compute by sampling the offset on `dayBucket`
  // T00:00 PT — which is the offset that applies right now. PT-midnight is
  // UTC = local + offsetMinutes.
  const ptMidnightLocalUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    timeZoneName: 'shortOffset',
  });
  const parts = offsetFormatter.formatToParts(ptMidnightLocalUtc);
  const tzPart = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-8';
  const offsetMatch = /GMT([+-]\d+)(?::?(\d+))?/.exec(tzPart);
  const offsetHours = offsetMatch ? Number.parseInt(offsetMatch[1] ?? '0', 10) : -8;
  const offsetMinutes = offsetMatch && offsetMatch[2] ? Number.parseInt(offsetMatch[2], 10) : 0;
  const totalOffsetMs = (offsetHours * 60 + (offsetHours < 0 ? -offsetMinutes : offsetMinutes)) * 60 * 1000;
  // PT-midnight in UTC = the wall-clock midnight minus the offset.
  const ptMidnightUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - totalOffsetMs;
  const nextMidnightUtcMs = ptMidnightUtcMs + 24 * 60 * 60 * 1000;
  return new Date(nextMidnightUtcMs).toISOString();
}

export async function readIdentitySubmitQuota(
  identity: SubmissionIdentity,
  now: Date = new Date(),
): Promise<IdentityQuotaSnapshot> {
  const dayBucketPt = getPacificDayBucket(now);
  const { data, error } = await supabaseAdmin
    .from('ka_identity_submit_guard')
    .select('day_bucket_pt, day_count, frozen_until, freeze_reason')
    .eq('identity_key', identity.keyHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read identity quota: ${error.message}`);
  }

  // Day counter only counts when the stored bucket is today's bucket;
  // otherwise the row is stale and the effective count for today is 0.
  const storedBucket = (data?.day_bucket_pt as string | null | undefined) ?? null;
  const dayUsed = storedBucket === dayBucketPt
    ? coercePositiveInt(data?.day_count as number | null | undefined, 0)
    : 0;
  const dayMax = SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY;

  const frozenUntilRaw = (data?.frozen_until as string | null | undefined) ?? null;
  const frozenUntilMs = frozenUntilRaw ? new Date(frozenUntilRaw).getTime() : NaN;
  const frozen = Number.isFinite(frozenUntilMs) && frozenUntilMs > now.getTime();

  return {
    dayBucketPt,
    day: {
      used: dayUsed,
      max: dayMax,
      remaining: Math.max(0, dayMax - dayUsed),
    },
    frozen,
    frozenUntil: frozen ? frozenUntilRaw : null,
    freezeReason: frozen ? ((data?.freeze_reason as string | null | undefined) ?? null) : null,
    resetsAtUtc: nextPacificMidnightUtc(now),
  };
}

export async function readAttemptSubmitQuota(
  attemptToken: string,
  now: Date = new Date(),
): Promise<AttemptQuotaSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from('ka_challenge_sessions')
    .select('attempt_token, retry_count, submit_attempt_timestamps_ms, started_at, deadline_utc, consumed_at, ka_challenges(level)')
    .eq('attempt_token', attemptToken)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read attempt quota: ${error.message}`);
  }
  if (!data) return null;

  const nowMs = now.getTime();
  const minuteUsed = countTimestampsWithin(data.submit_attempt_timestamps_ms, 60 * 1000, nowMs);
  const hourUsed = countTimestampsWithin(data.submit_attempt_timestamps_ms, 60 * 60 * 1000, nowMs);
  const retryUsed = coercePositiveInt(data.retry_count as number | null | undefined, 0);

  const minuteMax = SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE;
  const hourMax = SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR;
  const retryMax = SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN;

  const deadlineUtc = (data.deadline_utc as string | null | undefined) ?? null;
  const deadlineMs = deadlineUtc ? new Date(deadlineUtc).getTime() : NaN;
  const expired = Number.isFinite(deadlineMs) ? deadlineMs <= nowMs : false;

  const challengeRel = data['ka_challenges'] as { level?: number | string | null } | { level?: number | string | null }[] | null | undefined;
  const challengeRow = Array.isArray(challengeRel) ? challengeRel[0] : challengeRel;
  const levelRaw = challengeRow?.level;
  const levelParsed = typeof levelRaw === 'number' ? levelRaw : Number(levelRaw ?? NaN);
  const level = Number.isFinite(levelParsed) ? Math.trunc(levelParsed) : null;

  return {
    attemptToken,
    level,
    challengeStartedAtUtc: (data.started_at as string | null | undefined) ?? null,
    deadlineUtc,
    expired,
    consumedAt: (data.consumed_at as string | null | undefined) ?? null,
    minute: {
      used: minuteUsed,
      max: minuteMax,
      remaining: Math.max(0, minuteMax - minuteUsed),
    },
    hour: {
      used: hourUsed,
      max: hourMax,
      remaining: Math.max(0, hourMax - hourUsed),
    },
    retry: {
      used: retryUsed,
      max: retryMax,
      remaining: Math.max(0, retryMax - retryUsed),
    },
  };
}
