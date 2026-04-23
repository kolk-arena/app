-- Kolk Arena — attemptToken retry-until-pass foundation
--
-- Contract lock: see docs/SUBMISSION_API.md §Why attemptToken exists,
-- docs/BETA_DOC_HIERARCHY.md §2026-04-17 contract updates.
--
-- Changes:
--   1. Rename ka_challenge_sessions.fetch_token → attempt_token
--   2. Replace ka_challenge_sessions.submitted boolean with consumed_at timestamptz
--      (consumption happens only on Dual-Gate pass; failed runs leave the session alive)
--   3. Drop the per-session submit uniqueness; multiple retries are now allowed
--   4. Rename the fetch_token index for consistency

-- ---------------------------------------------------------------------------
-- 1. Rename the column
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_challenge_sessions
  RENAME COLUMN fetch_token TO attempt_token;

ALTER INDEX IF EXISTS idx_ka_cs_fetch_token
  RENAME TO idx_ka_cs_attempt_token;

-- ---------------------------------------------------------------------------
-- 2. Introduce consumed_at, backfill from historical passing submissions
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_challenge_sessions
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- Backfill: for any challenge session that had a passing submission, mark
-- consumed_at with that submission's timestamp. Use earliest passing run
-- so the audit record reflects when the token was actually retired.
WITH first_pass AS (
  SELECT
    s.challenge_session_id,
    MIN(s.submitted_at) AS first_pass_at
  FROM public.ka_submissions AS s
  WHERE s.challenge_session_id IS NOT NULL
    AND COALESCE(s.unlocked, false) = true
  GROUP BY s.challenge_session_id
)
UPDATE public.ka_challenge_sessions AS cs
SET consumed_at = fp.first_pass_at
FROM first_pass AS fp
WHERE fp.challenge_session_id = cs.id
  AND cs.consumed_at IS NULL;

-- Anything that was marked submitted = true but never had a passing
-- submission is historical data from the old semantics. Treat as
-- consumed at created_at + 24h (i.e. expired on the old ceiling) so that
-- old unfinished sessions remain unusable; this preserves the prior behavior
-- for legacy rows while the new code writes only consumed_at on pass.
UPDATE public.ka_challenge_sessions AS cs
SET consumed_at = LEAST(cs.deadline_utc, now())
WHERE cs.submitted = true
  AND cs.consumed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Drop the submitted column — superseded by consumed_at semantics
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_challenge_sessions
  DROP COLUMN submitted;

-- ---------------------------------------------------------------------------
-- 4. Drop the per-session submit uniqueness (multiple retries are allowed)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_ka_submissions_session_unique;

-- Helpful index: best-of-N lookups by session
CREATE INDEX IF NOT EXISTS idx_ka_submissions_session_submitted_at
  ON public.ka_submissions (challenge_session_id, submitted_at DESC)
  WHERE challenge_session_id IS NOT NULL;
