-- Kolk Arena — Cross-process submit rate limit
--
-- DB-backed submit limiter keyed on attemptToken. Keeps rate-limit state
-- consistent across runtime instances.

-- ---------------------------------------------------------------------------
-- Per-attemptToken sliding-window counter
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ka_submit_rate_limit (
  attempt_token text PRIMARY KEY,
  -- Ring of recent submit timestamps (epoch milliseconds). The function below
  -- trims outside the sliding window on each call.
  timestamps    bigint[] NOT NULL DEFAULT ARRAY[]::bigint[],
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ka_submit_rate_limit_updated_at
  ON public.ka_submit_rate_limit (updated_at);

ALTER TABLE public.ka_submit_rate_limit ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: writes must flow through supabaseAdmin.

-- ---------------------------------------------------------------------------
-- Atomic check-and-insert for the sliding window. Returns whether the caller
-- is allowed to submit AND, if not, the retry-after in seconds.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ka_claim_submit_slot(
  p_attempt_token text,
  p_window_ms     bigint,
  p_limit         int
)
RETURNS TABLE(allowed boolean, retry_after_seconds int)
LANGUAGE plpgsql
AS $$
DECLARE
  now_ms    bigint := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  kept      bigint[];
  existing  bigint[];
  oldest_ts bigint;
BEGIN
  SELECT timestamps INTO existing
  FROM public.ka_submit_rate_limit
  WHERE attempt_token = p_attempt_token
  FOR UPDATE;

  existing := COALESCE(existing, ARRAY[]::bigint[]);

  SELECT COALESCE(array_agg(ts ORDER BY ts), ARRAY[]::bigint[])
  INTO kept
  FROM unnest(existing) AS ts
  WHERE ts > now_ms - p_window_ms;

  IF array_length(kept, 1) >= p_limit THEN
    oldest_ts := kept[1];
    RETURN QUERY SELECT
      false,
      GREATEST(1, CEIL((p_window_ms - (now_ms - oldest_ts))::numeric / 1000)::int);
    RETURN;
  END IF;

  kept := kept || now_ms;

  INSERT INTO public.ka_submit_rate_limit (attempt_token, timestamps, updated_at)
  VALUES (p_attempt_token, kept, now())
  ON CONFLICT (attempt_token) DO UPDATE
  SET timestamps = EXCLUDED.timestamps,
      updated_at = now();

  RETURN QUERY SELECT true, 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cleanup helper — intended to be called periodically by a scheduled task.
-- Removes rate-limit rows whose most recent activity is older than 1 hour.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ka_cleanup_submit_rate_limit()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  deleted int;
BEGIN
  DELETE FROM public.ka_submit_rate_limit
  WHERE updated_at < now() - interval '1 hour';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;
