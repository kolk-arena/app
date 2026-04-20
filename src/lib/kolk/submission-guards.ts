import { hashCode, normalizeEmail } from '@/lib/kolk/auth';
import { supabaseAdmin } from '@/lib/kolk/db';

const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

// Launch-week relaxation (2026-04-20): raised from 2/20 → 6/40 because the
// judge layer had intermittent 5xx and genuine players were hitting their
// minute/hour cap while legitimately retrying after OUR failures. Pair with
// migration 00016_launch_rate_limit_release.sql, which introduces
// release RPCs that unwind a claim on any 5xx exit so server-side faults
// no longer count against the player's quota.
export const SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_MINUTE = 6;
export const SUBMIT_RATE_LIMIT_PER_ATTEMPT_TOKEN_PER_HOUR = 40;
export const SUBMIT_RETRY_CAP_PER_ATTEMPT_TOKEN = 10;
export const SUBMIT_RATE_LIMIT_PER_IDENTITY_PER_DAY = 99;

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
  day: {
    used: number;
    max: number;
  };
};

export type IdentityLimitBlocked = {
  allowed: false;
  code: 'ACCOUNT_FROZEN' | 'RATE_LIMIT_DAY';
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
  const { data, error } = await supabaseAdmin.rpc('ka_claim_identity_submit_attempt', {
    p_identity_key: identity.keyHash,
    p_identity_kind: identity.kind,
    p_user_id: identity.kind === 'user' ? identity.userId : null,
    p_day_bucket_pt: getPacificDayBucket(),
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
// 00016_launch_rate_limit_release.sql for the RPC definitions.
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
