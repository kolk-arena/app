-- Kolk Arena — launch-week rate-limit release + relaxed caps
--
-- Context (T-0, 2026-04-20): the judge layer is intermittently returning 503
-- SCORING_UNAVAILABLE on L1+ submissions. The prior limits (2/min, 20/hour
-- per attemptToken) plus "every submit counts, even on 5xx" meant a real
-- player who hit our failure got punished for our bug — two retries in a row
-- burned their minute quota and they saw RATE_LIMIT_MINUTE on top of the
-- judge failure. That's a double-penalty for a server-side problem.
--
-- This migration:
--   1. Adds ka_release_attempt_submit_slot()   — pops the most recent submit
--      timestamp and decrements retry_count. Called from the submit route on
--      any 5xx exit that happens AFTER the claim succeeded.
--   2. Adds ka_release_identity_submit_attempt() — same idea for the identity
--      (daily / freeze) guard.
--
-- Paired with a constants bump in src/lib/kolk/submission-guards.ts (minute
-- 2→6, hour 20→40). See docs/SUBMISSION_API.md §Rate Limiting.
--
-- Design notes:
--   * "Most recent" is defined as the numerically-largest timestamp in the
--     array. In practice release fires within ~100 ms of the paired claim
--     so the last-written entry is ours. A race where a parallel claim
--     arrives in between is possible but harmless — we'd release the later
--     attempt's slot instead. Worst case: one extra permitted retry.
--   * Neither function errors if the row is missing. Release should always
--     be best-effort; a failure here must not mask the original 5xx.
--   * retry_count floors at 0 (never goes negative).
--   * Day count only decrements if the stored bucket matches the supplied
--     one, to avoid clobbering a day-rollover that happened between claim
--     and release.
--   * We use array_position + array slicing instead of a CTE with
--     WITH ORDINALITY. PL/pgSQL + WITH ORDINALITY + a local variable of
--     the same name as a CTE/column alias confuses the parser ("relation
--     does not exist"); array_position is simpler and portable.

-- ---------------------------------------------------------------------------
-- 1. Release attemptToken slot (minute/hour/retry)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ka_release_attempt_submit_slot(
  p_attempt_token text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  existing        bigint[];
  session_retry   int;
  latest_ts       bigint;
  max_pos         int;
  kept            bigint[];
  arr_len         int;
BEGIN
  SELECT submit_attempt_timestamps_ms, retry_count
  INTO existing, session_retry
  FROM public.ka_challenge_sessions
  WHERE attempt_token = p_attempt_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  existing := COALESCE(existing, ARRAY[]::bigint[]);
  arr_len := array_length(existing, 1);

  IF arr_len IS NULL OR arr_len = 0 THEN
    RETURN;
  END IF;

  -- Find the max timestamp (the one we just claimed) and remove a single
  -- occurrence. array_position returns the 1-based index of the first
  -- match; stitch the array back together with slicing.
  SELECT MAX(ts) INTO latest_ts FROM unnest(existing) AS ts;
  max_pos := array_position(existing, latest_ts);

  IF max_pos IS NULL THEN
    kept := existing;
  ELSIF arr_len = 1 THEN
    kept := ARRAY[]::bigint[];
  ELSIF max_pos = 1 THEN
    kept := existing[2:arr_len];
  ELSIF max_pos = arr_len THEN
    kept := existing[1:arr_len - 1];
  ELSE
    kept := existing[1:max_pos - 1] || existing[max_pos + 1:arr_len];
  END IF;

  UPDATE public.ka_challenge_sessions
  SET
    submit_attempt_timestamps_ms = kept,
    retry_count = GREATEST(0, COALESCE(session_retry, 0) - 1)
  WHERE attempt_token = p_attempt_token;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Release identity slot (day bucket + recent_attempts_ms)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ka_release_identity_submit_attempt(
  p_identity_key  text,
  p_day_bucket_pt date
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  existing_bucket date;
  existing_count  int;
  existing_recent bigint[];
  latest_ts       bigint;
  max_pos         int;
  kept            bigint[];
  arr_len         int;
BEGIN
  SELECT day_bucket_pt, day_count, recent_attempts_ms
  INTO existing_bucket, existing_count, existing_recent
  FROM public.ka_identity_submit_guard
  WHERE identity_key = p_identity_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  existing_recent := COALESCE(existing_recent, ARRAY[]::bigint[]);
  arr_len := array_length(existing_recent, 1);

  IF arr_len IS NULL OR arr_len = 0 THEN
    kept := ARRAY[]::bigint[];
  ELSE
    SELECT MAX(ts) INTO latest_ts FROM unnest(existing_recent) AS ts;
    max_pos := array_position(existing_recent, latest_ts);

    IF max_pos IS NULL THEN
      kept := existing_recent;
    ELSIF arr_len = 1 THEN
      kept := ARRAY[]::bigint[];
    ELSIF max_pos = 1 THEN
      kept := existing_recent[2:arr_len];
    ELSIF max_pos = arr_len THEN
      kept := existing_recent[1:arr_len - 1];
    ELSE
      kept := existing_recent[1:max_pos - 1] || existing_recent[max_pos + 1:arr_len];
    END IF;
  END IF;

  UPDATE public.ka_identity_submit_guard
  SET
    recent_attempts_ms = kept,
    day_count = CASE
      WHEN existing_bucket = p_day_bucket_pt
        THEN GREATEST(0, COALESCE(existing_count, 0) - 1)
      ELSE COALESCE(existing_count, 0)
    END,
    updated_at = now()
  WHERE identity_key = p_identity_key;
END;
$$;
