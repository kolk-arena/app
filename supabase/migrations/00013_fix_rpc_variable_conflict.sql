-- Kolk Arena — fix PL/pgSQL variable vs column ambiguity in 00012 RPCs
--
-- Bug: migration 00012 declared RETURNS TABLE(... frozen_until timestamptz ...)
-- for ka_claim_identity_submit_attempt and RETURNS TABLE(... retry_count int ...)
-- for ka_claim_attempt_submit_slot. Both OUT names shadow real columns on
-- ka_identity_submit_guard and ka_challenge_sessions respectively. When the
-- function SELECTs those columns, PG raises 42702 "column reference is
-- ambiguous" and the submit route returns 500 INTERNAL_ERROR.
--
-- Fix: add #variable_conflict use_column so column references win in SELECT /
-- UPDATE contexts. Variable assignments remain unambiguous because PL/pgSQL
-- only treats them as variable writes.

CREATE OR REPLACE FUNCTION public.ka_claim_attempt_submit_slot(
  p_attempt_token text,
  p_minute_limit int,
  p_hour_limit int,
  p_retry_cap int
)
RETURNS TABLE(
  allowed boolean,
  code text,
  retry_after_seconds int,
  minute_used int,
  minute_max int,
  hour_used int,
  hour_max int,
  retry_count int,
  retry_max int
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  now_ms bigint := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  session_retry_count int;
  existing bigint[];
  kept bigint[];
  next_retry_count int;
  minute_count int;
  hour_count int;
  minute_oldest bigint;
  hour_oldest bigint;
BEGIN
  SELECT retry_count, submit_attempt_timestamps_ms
  INTO session_retry_count, existing
  FROM public.ka_challenge_sessions
  WHERE attempt_token = p_attempt_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, 'INVALID_ATTEMPT_TOKEN', 0, 0, p_minute_limit, 0, p_hour_limit, 0, p_retry_cap;
    RETURN;
  END IF;

  existing := COALESCE(existing, ARRAY[]::bigint[]);

  SELECT COALESCE(array_agg(ts ORDER BY ts), ARRAY[]::bigint[])
  INTO kept
  FROM unnest(existing) AS ts
  WHERE ts > now_ms - 3600000;

  kept := kept || now_ms;
  next_retry_count := COALESCE(session_retry_count, 0) + 1;

  SELECT COUNT(*)::int, MIN(ts)
  INTO minute_count, minute_oldest
  FROM unnest(kept) AS ts
  WHERE ts > now_ms - 60000;

  hour_count := COALESCE(array_length(kept, 1), 0);
  hour_oldest := kept[1];

  UPDATE public.ka_challenge_sessions
  SET
    retry_count = next_retry_count,
    submit_attempt_timestamps_ms = kept
  WHERE attempt_token = p_attempt_token;

  IF next_retry_count >= p_retry_cap THEN
    RETURN QUERY
    SELECT
      false,
      'RETRY_LIMIT_EXCEEDED',
      0,
      minute_count,
      p_minute_limit,
      hour_count,
      p_hour_limit,
      next_retry_count,
      p_retry_cap;
    RETURN;
  END IF;

  IF minute_count > p_minute_limit THEN
    RETURN QUERY
    SELECT
      false,
      'RATE_LIMIT_MINUTE',
      GREATEST(1, CEIL((60000 - (now_ms - COALESCE(minute_oldest, now_ms)))::numeric / 1000)::int),
      minute_count,
      p_minute_limit,
      hour_count,
      p_hour_limit,
      next_retry_count,
      p_retry_cap;
    RETURN;
  END IF;

  IF hour_count > p_hour_limit THEN
    RETURN QUERY
    SELECT
      false,
      'RATE_LIMIT_HOUR',
      GREATEST(1, CEIL((3600000 - (now_ms - COALESCE(hour_oldest, now_ms)))::numeric / 1000)::int),
      minute_count,
      p_minute_limit,
      hour_count,
      p_hour_limit,
      next_retry_count,
      p_retry_cap;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    true,
    NULL::text,
    0,
    minute_count,
    p_minute_limit,
    hour_count,
    p_hour_limit,
    next_retry_count,
    p_retry_cap;
END;
$$;

CREATE OR REPLACE FUNCTION public.ka_claim_identity_submit_attempt(
  p_identity_key text,
  p_identity_kind text,
  p_user_id uuid,
  p_day_bucket_pt date,
  p_day_limit int
)
RETURNS TABLE(
  allowed boolean,
  code text,
  retry_after_seconds int,
  day_used int,
  day_max int,
  frozen_until timestamptz,
  reason text,
  minute_used int,
  minute_threshold int,
  five_min_used int,
  five_min_threshold int
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  now_ms bigint := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  now_ts timestamptz := clock_timestamp();
  existing_day_bucket date;
  existing_day_count int;
  existing_recent bigint[];
  existing_frozen_until timestamptz;
  existing_freeze_reason text;
  kept bigint[];
  next_day_count int;
  one_second_count int;
  one_minute_count int;
  five_minute_count int;
  freeze_until_value timestamptz;
  freeze_reason_value text;
  retry_after_value int;
BEGIN
  SELECT
    day_bucket_pt,
    day_count,
    recent_attempts_ms,
    frozen_until,
    freeze_reason
  INTO
    existing_day_bucket,
    existing_day_count,
    existing_recent,
    existing_frozen_until,
    existing_freeze_reason
  FROM public.ka_identity_submit_guard
  WHERE identity_key = p_identity_key
  FOR UPDATE;

  IF FOUND AND existing_frozen_until IS NOT NULL AND existing_frozen_until > now_ts THEN
    RETURN QUERY
    SELECT
      false,
      'ACCOUNT_FROZEN',
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (existing_frozen_until - now_ts)))::int),
      CASE WHEN existing_day_bucket = p_day_bucket_pt THEN COALESCE(existing_day_count, 0) ELSE 0 END,
      p_day_limit,
      existing_frozen_until,
      existing_freeze_reason,
      0,
      20,
      0,
      30;
    RETURN;
  END IF;

  existing_recent := COALESCE(existing_recent, ARRAY[]::bigint[]);

  SELECT COALESCE(array_agg(ts ORDER BY ts), ARRAY[]::bigint[])
  INTO kept
  FROM unnest(existing_recent) AS ts
  WHERE ts > now_ms - 300000;

  kept := kept || now_ms;

  SELECT COUNT(*)::int
  INTO one_second_count
  FROM unnest(kept) AS ts
  WHERE ts > now_ms - 1000;

  SELECT COUNT(*)::int, COUNT(*)::int
  INTO one_minute_count, five_minute_count
  FROM unnest(kept) AS ts
  WHERE ts > now_ms - 60000;

  five_minute_count := COALESCE(array_length(kept, 1), 0);
  next_day_count := CASE
    WHEN existing_day_bucket = p_day_bucket_pt THEN COALESCE(existing_day_count, 0) + 1
    ELSE 1
  END;

  IF one_second_count >= 6 THEN
    freeze_until_value := now_ts + interval '5 hours';
    freeze_reason_value := format('%s attempts detected within 1 second', one_second_count);
  ELSIF one_minute_count >= 20 THEN
    freeze_until_value := now_ts + interval '5 hours';
    freeze_reason_value := format('%s attempts detected within 1 minute', one_minute_count);
  ELSIF five_minute_count >= 30 THEN
    freeze_until_value := now_ts + interval '5 hours';
    freeze_reason_value := format('%s attempts detected within 5 minutes', five_minute_count);
  ELSE
    freeze_until_value := NULL;
    freeze_reason_value := NULL;
  END IF;

  INSERT INTO public.ka_identity_submit_guard (
    identity_key,
    identity_kind,
    user_id,
    day_bucket_pt,
    day_count,
    recent_attempts_ms,
    frozen_until,
    freeze_reason,
    updated_at
  )
  VALUES (
    p_identity_key,
    p_identity_kind,
    p_user_id,
    p_day_bucket_pt,
    next_day_count,
    kept,
    freeze_until_value,
    freeze_reason_value,
    now()
  )
  ON CONFLICT (identity_key) DO UPDATE
  SET
    identity_kind = EXCLUDED.identity_kind,
    user_id = EXCLUDED.user_id,
    day_bucket_pt = EXCLUDED.day_bucket_pt,
    day_count = EXCLUDED.day_count,
    recent_attempts_ms = EXCLUDED.recent_attempts_ms,
    frozen_until = EXCLUDED.frozen_until,
    freeze_reason = EXCLUDED.freeze_reason,
    updated_at = now();

  IF freeze_until_value IS NOT NULL THEN
    RETURN QUERY
    SELECT
      false,
      'ACCOUNT_FROZEN',
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (freeze_until_value - now_ts)))::int),
      next_day_count,
      p_day_limit,
      freeze_until_value,
      freeze_reason_value,
      one_minute_count,
      20,
      five_minute_count,
      30;
    RETURN;
  END IF;

  IF next_day_count > p_day_limit THEN
    retry_after_value := GREATEST(
      1,
      CEIL(
        EXTRACT(
          EPOCH FROM (
            ((date_trunc('day', now_ts AT TIME ZONE 'America/Los_Angeles') + interval '1 day')
              AT TIME ZONE 'America/Los_Angeles') - now_ts
          )
        )
      )::int
    );

    RETURN QUERY
    SELECT
      false,
      'RATE_LIMIT_DAY',
      retry_after_value,
      next_day_count,
      p_day_limit,
      NULL::timestamptz,
      NULL::text,
      one_minute_count,
      20,
      five_minute_count,
      30;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    true,
    NULL::text,
    0,
    next_day_count,
    p_day_limit,
    NULL::timestamptz,
    NULL::text,
    one_minute_count,
    20,
    five_minute_count,
    30;
END;
$$;
