-- Kolk Arena — Backfill anonymous eligible submissions into ka_leaderboard
--
-- Symptom: /leaderboard live activity can show "Anonymous xxxx passed L5"
-- while standings stay empty. That means ka_submissions was committed and
-- participant_id was backfilled, but the materialized ka_leaderboard side
-- effect did not persist.
--
-- This migration rebuilds leaderboard rows from the canonical submission
-- history for every participant that has an unlocked, leaderboard-eligible
-- L1+ submission. It is idempotent and repairs anonymous and registered rows.

ALTER TABLE public.ka_leaderboard
  ADD COLUMN IF NOT EXISTS pioneer boolean NOT NULL DEFAULT false;

WITH best_runs AS (
  SELECT DISTINCT ON (s.participant_id, s.level)
    s.participant_id,
    s.level,
    s.total_score,
    s.color_band,
    s.quality_label,
    s.solve_time_seconds,
    s.efficiency_badge,
    s.submitted_at,
    s.country_code
  FROM public.ka_submissions AS s
  WHERE s.participant_id IS NOT NULL
    AND COALESCE(s.unlocked, false) = true
    AND COALESCE(s.leaderboard_eligible, false) = true
    AND s.level BETWEEN 1 AND 8
  ORDER BY
    s.participant_id,
    s.level,
    s.total_score DESC NULLS LAST,
    s.solve_time_seconds ASC NULLS LAST,
    s.submitted_at ASC
),
rollup AS (
  SELECT
    participant_id,
    jsonb_object_agg(level::text, total_score ORDER BY level) AS best_scores,
    SUM(total_score)::numeric(10, 2) AS total_score,
    COUNT(*)::int AS levels_completed,
    MAX(level)::int AS highest_level
  FROM best_runs
  GROUP BY participant_id
),
frontier AS (
  SELECT DISTINCT ON (participant_id)
    participant_id,
    level AS highest_level,
    total_score AS best_score_on_highest,
    color_band AS best_color_band,
    quality_label AS best_quality_label,
    solve_time_seconds,
    efficiency_badge,
    submitted_at,
    country_code
  FROM best_runs
  ORDER BY
    participant_id,
    level DESC,
    total_score DESC NULLS LAST,
    solve_time_seconds ASC NULLS LAST,
    submitted_at ASC
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
  country_code
)
SELECT
  r.participant_id,
  u.display_name,
  u.handle,
  u.agent_stack,
  u.affiliation,
  r.total_score,
  r.levels_completed,
  r.highest_level,
  r.best_scores,
  f.best_score_on_highest,
  f.best_color_band,
  f.best_quality_label,
  f.solve_time_seconds,
  COALESCE(f.efficiency_badge, false),
  CASE
    WHEN r.highest_level >= 8 AND r.levels_completed >= 8 THEN 'builder'
    WHEN r.highest_level >= 6 AND r.levels_completed >= 6 THEN 'builder'
    ELSE 'starter'
  END AS tier,
  r.highest_level >= 8 AS pioneer,
  COALESCE(u.is_anon, false) AS is_anon,
  f.submitted_at,
  COALESCE(f.country_code, u.country_code)
FROM rollup AS r
JOIN frontier AS f ON f.participant_id = r.participant_id
JOIN public.ka_users AS u ON u.id = r.participant_id
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
  updated_at = now();
