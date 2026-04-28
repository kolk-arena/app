import { supabaseAdmin } from '@/lib/kolk/db';
import { asOptionalPublicString } from '@/lib/kolk/public-contract';

export const SESSION_ATTEMPTS_LIMIT = 20;

export type SessionAttemptsIdentity =
  | { participantId: string; anonToken?: never }
  | { anonToken: string; participantId?: never };

export type SessionAttemptSummary = {
  attemptToken: string;
  level: number | null;
  challengeId: string;
  seed: number | null;
  variant: string | null;
  startedAt: string | null;
  deadlineUtc: string | null;
  expired: boolean;
  consumedAt: string | null;
  passed: boolean;
  submittedCount: number;
  latestSubmission: SessionAttemptSubmissionSummary | null;
};

export type SessionAttemptSubmissionSummary = {
  submissionId: string;
  level: number;
  totalScore: number;
  unlocked: boolean;
  submittedAt: string | null;
  summary: string | null;
  qualityLabel: string | null;
};

type SessionRow = {
  id: string | null;
  attempt_token: string | null;
  challenge_id: string | null;
  started_at: string | null;
  deadline_utc: string | null;
  consumed_at: string | null;
};

type ChallengeRow = {
  id: string | null;
  level: number | string | null;
  seed: number | string | null;
  variant: string | null;
};

type SubmissionRow = {
  id: string | null;
  challenge_session_id: string | null;
  level: number | string | null;
  total_score: number | string | null;
  unlocked: boolean | null;
  submitted_at: string | null;
  judge_summary: string | null;
  quality_label: string | null;
};

function asFiniteNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asIntOrNull(value: unknown) {
  const parsed = asFiniteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function asIsoOrNull(value: unknown) {
  const candidate = asOptionalPublicString(value);
  if (!candidate) return null;
  return Number.isNaN(new Date(candidate).getTime()) ? null : candidate;
}

function isPastDeadline(deadlineUtc: string | null, now: Date) {
  if (!deadlineUtc) return false;
  return new Date(deadlineUtc).getTime() <= now.getTime();
}

function normalizeSubmission(row: SubmissionRow): SessionAttemptSubmissionSummary | null {
  const submissionId = asOptionalPublicString(row.id);
  if (!submissionId) return null;

  return {
    submissionId,
    level: Math.max(0, asFiniteNumber(row.level, 0)),
    totalScore: asFiniteNumber(row.total_score, 0),
    unlocked: row.unlocked === true,
    submittedAt: asIsoOrNull(row.submitted_at),
    summary: asOptionalPublicString(row.judge_summary),
    qualityLabel: asOptionalPublicString(row.quality_label),
  };
}

export async function fetchSessionAttemptsForIdentity(
  identity: SessionAttemptsIdentity,
  options?: { now?: Date; limit?: number },
): Promise<SessionAttemptSummary[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? SESSION_ATTEMPTS_LIMIT, SESSION_ATTEMPTS_LIMIT));
  const now = options?.now ?? new Date();

  const sessionBaseQuery = supabaseAdmin
    .from('ka_challenge_sessions')
    .select('id, attempt_token, challenge_id, started_at, deadline_utc, consumed_at');

  const sessionResult = 'participantId' in identity
    ? await sessionBaseQuery.eq('participant_id', identity.participantId).order('started_at', { ascending: false }).limit(limit)
    : await sessionBaseQuery.eq('anon_token', identity.anonToken).order('started_at', { ascending: false }).limit(limit);

  if (sessionResult.error) {
    throw new Error(`Failed to fetch challenge sessions: ${sessionResult.error.message}`);
  }

  const sessions = ((sessionResult.data ?? []) as SessionRow[])
    .filter((row) => asOptionalPublicString(row.id) && asOptionalPublicString(row.attempt_token));

  if (sessions.length === 0) return [];

  const challengeIds = Array.from(new Set(
    sessions
      .map((row) => asOptionalPublicString(row.challenge_id))
      .filter((id): id is string => Boolean(id)),
  ));
  const sessionIds = sessions
    .map((row) => asOptionalPublicString(row.id))
    .filter((id): id is string => Boolean(id));

  const [{ data: challengeRows, error: challengeError }, { data: submissionRows, error: submissionError }] =
    await Promise.all([
      supabaseAdmin
        .from('ka_challenges')
        .select('id, level, seed, variant')
        .in('id', challengeIds),
      supabaseAdmin
        .from('ka_submissions')
        .select('id, challenge_session_id, level, total_score, unlocked, submitted_at, judge_summary, quality_label')
        .in('challenge_session_id', sessionIds)
        .order('submitted_at', { ascending: false }),
    ]);

  if (challengeError) {
    throw new Error(`Failed to fetch challenge metadata: ${challengeError.message}`);
  }
  if (submissionError) {
    throw new Error(`Failed to fetch submission summaries: ${submissionError.message}`);
  }

  const challengesById = new Map<string, ChallengeRow>();
  for (const row of (challengeRows ?? []) as ChallengeRow[]) {
    const id = asOptionalPublicString(row.id);
    if (id) challengesById.set(id, row);
  }

  const submissionsBySessionId = new Map<string, SessionAttemptSubmissionSummary[]>();
  for (const row of (submissionRows ?? []) as SubmissionRow[]) {
    const sessionId = asOptionalPublicString(row.challenge_session_id);
    if (!sessionId) continue;
    const normalized = normalizeSubmission(row);
    if (!normalized) continue;
    const list = submissionsBySessionId.get(sessionId) ?? [];
    list.push(normalized);
    submissionsBySessionId.set(sessionId, list);
  }

  return sessions.map((session) => {
    const sessionId = asOptionalPublicString(session.id) as string;
    const challengeId = asOptionalPublicString(session.challenge_id) ?? '';
    const challenge = challengesById.get(challengeId);
    const submissions = submissionsBySessionId.get(sessionId) ?? [];
    const deadlineUtc = asIsoOrNull(session.deadline_utc);
    const consumedAt = asIsoOrNull(session.consumed_at);
    const hasPassingSubmission = submissions.some((submission) => submission.unlocked);

    return {
      attemptToken: asOptionalPublicString(session.attempt_token) as string,
      level: asIntOrNull(challenge?.level),
      challengeId,
      seed: asIntOrNull(challenge?.seed),
      variant: asOptionalPublicString(challenge?.variant),
      startedAt: asIsoOrNull(session.started_at),
      deadlineUtc,
      expired: isPastDeadline(deadlineUtc, now),
      consumedAt,
      passed: hasPassingSubmission,
      submittedCount: submissions.length,
      latestSubmission: submissions[0] ?? null,
    };
  });
}
