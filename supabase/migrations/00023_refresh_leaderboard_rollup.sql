-- Kolk Arena — Canonical leaderboard rollup from submissions
--
-- The public leaderboard is a materialized cache, but the source of truth is
-- unlocked, leaderboard-eligible ka_submissions. This migration repairs the
-- historical anonymous case where ka_submissions committed with anon_token but
-- participant_id stayed null, then installs a per-participant refresh RPC that
-- aggregates from submissions under an advisory transaction lock.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.ka_leaderboard
  ADD COLUMN IF NOT EXISTS activity_submission_id uuid REFERENCES public.ka_submissions(id) ON DELETE SET NULL;

WITH anon_sources AS (
  SELECT DISTINCT
    encode(digest(anon_token, 'sha256'), 'hex') AS anon_session_hash
  FROM public.ka_submissions
  WHERE participant_id IS NULL
    AND anon_token IS NOT NULL
    AND COALESCE(unlocked, false) = true
    AND COALESCE(leaderboard_eligible, false) = true
    AND level BETWEEN 1 AND 5
),
created_anon_users AS (
  INSERT INTO public.ka_users (
    email,
    display_name,
    is_verified,
    is_anon,
    anon_session_hash
  )
  SELECT
    NULL,
    'Anonymous ' || lower(left(anon_session_hash, 4)),
    false,
    true,
    anon_session_hash
  FROM anon_sources
  ON CONFLICT (anon_session_hash) WHERE anon_session_hash IS NOT NULL DO UPDATE
  SET
    is_anon = true,
    display_name = COALESCE(public.ka_users.display_name, EXCLUDED.display_name)
  RETURNING id, anon_session_hash
),
anon_users AS (
  SELECT id, anon_session_hash
  FROM created_anon_users
  UNION
  SELECT u.id, u.anon_session_hash
  FROM public.ka_users AS u
  JOIN anon_sources AS a ON a.anon_session_hash = u.anon_session_hash
)
UPDATE public.ka_submissions AS s
SET participant_id = u.id
FROM anon_users AS u
WHERE s.participant_id IS NULL
  AND s.anon_token IS NOT NULL
  AND COALESCE(s.unlocked, false) = true
  AND COALESCE(s.leaderboard_eligible, false) = true
  AND s.level BETWEEN 1 AND 5
  AND u.anon_session_hash = encode(digest(s.anon_token, 'sha256'), 'hex');

CREATE OR REPLACE FUNCTION public.refresh_ka_leaderboard_participant(p_participant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_participant_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_participant_id::text, 0));

  WITH best_runs AS (
    SELECT DISTINCT ON (s.level)
      s.id AS activity_submission_id,
      s.level,
      s.total_score,
      s.color_band,
      s.quality_label,
      s.solve_time_seconds,
      s.efficiency_badge,
      s.submitted_at,
      s.country_code
    FROM public.ka_submissions AS s
    WHERE s.participant_id = p_participant_id
      AND COALESCE(s.unlocked, false) = true
      AND COALESCE(s.leaderboard_eligible, false) = true
      AND s.level BETWEEN 1 AND 8
    ORDER BY
      s.level,
      s.total_score DESC NULLS LAST,
      s.solve_time_seconds ASC NULLS LAST,
      s.submitted_at ASC
  ),
  rollup AS (
    SELECT
      jsonb_object_agg(level::text, total_score ORDER BY level) AS best_scores,
      SUM(total_score)::numeric(10, 2) AS total_score,
      COUNT(*)::int AS levels_completed,
      MAX(level)::int AS highest_level
    FROM best_runs
  ),
  frontier AS (
    SELECT *
    FROM best_runs
    ORDER BY
      level DESC,
      total_score DESC NULLS LAST,
      solve_time_seconds ASC NULLS LAST,
      submitted_at ASC
    LIMIT 1
  )
  INSERT INTO public.ka_leaderboard (
    participant_id,
    display_name,
    handle,
    agent_stack,
    affiliation,
    total_score,
    levels_completed,
    highest_level,
    best_scores,
    best_score_on_highest,
    best_color_band,
    best_quality_label,
    solve_time_seconds,
    efficiency_badge,
    tier,
    pioneer,
    is_anon,
    last_submission_at,
    country_code,
    activity_submission_id
  )
  SELECT
    p_participant_id,
    u.display_name,
    u.handle,
    u.agent_stack,
    u.affiliation,
    r.total_score,
    r.levels_completed,
    r.highest_level,
    r.best_scores,
    f.total_score,
    f.color_band,
    f.quality_label,
    f.solve_time_seconds,
    COALESCE(f.efficiency_badge, false),
    CASE
      WHEN r.highest_level >= 8 AND r.levels_completed >= 8 THEN 'builder'
      WHEN r.highest_level >= 6 AND r.levels_completed >= 6 THEN 'builder'
      ELSE 'starter'
    END,
    r.highest_level >= 8,
    COALESCE(u.is_anon, false),
    f.submitted_at,
    COALESCE(f.country_code, u.country_code),
    f.activity_submission_id
  FROM rollup AS r
  CROSS JOIN frontier AS f
  JOIN public.ka_users AS u ON u.id = p_participant_id
  WHERE r.levels_completed > 0
  ON CONFLICT (participant_id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    handle = EXCLUDED.handle,
    agent_stack = EXCLUDED.agent_stack,
    affiliation = EXCLUDED.affiliation,
    total_score = EXCLUDED.total_score,
    levels_completed = EXCLUDED.levels_completed,
    highest_level = EXCLUDED.highest_level,
    best_scores = EXCLUDED.best_scores,
    best_score_on_highest = EXCLUDED.best_score_on_highest,
    best_color_band = EXCLUDED.best_color_band,
    best_quality_label = EXCLUDED.best_quality_label,
    solve_time_seconds = EXCLUDED.solve_time_seconds,
    efficiency_badge = EXCLUDED.efficiency_badge,
    tier = EXCLUDED.tier,
    pioneer = EXCLUDED.pioneer,
    is_anon = EXCLUDED.is_anon,
    last_submission_at = EXCLUDED.last_submission_at,
    country_code = EXCLUDED.country_code,
    activity_submission_id = EXCLUDED.activity_submission_id,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_ka_leaderboard_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_ka_leaderboard_participant(uuid) TO service_role;

SELECT public.refresh_ka_leaderboard_participant(participant_id)
FROM (
  SELECT DISTINCT participant_id
  FROM public.ka_submissions
  WHERE participant_id IS NOT NULL
    AND COALESCE(unlocked, false) = true
    AND COALESCE(leaderboard_eligible, false) = true
    AND level BETWEEN 1 AND 8
) AS participants;
