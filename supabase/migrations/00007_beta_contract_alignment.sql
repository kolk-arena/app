-- Kolk Arena — Beta contract alignment
-- Adds L0 onboarding seed plus public-beta result / leaderboard contract columns.

-- ---------------------------------------------------------------------------
-- Allow L0 challenge rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_challenges
  DROP CONSTRAINT IF EXISTS ka_challenges_level_check;

ALTER TABLE public.ka_challenges
  ADD CONSTRAINT ka_challenges_level_check CHECK (level BETWEEN 0 AND 20);

-- ---------------------------------------------------------------------------
-- Submission contract fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_submissions
  ADD COLUMN IF NOT EXISTS unlocked boolean,
  ADD COLUMN IF NOT EXISTS color_band text,
  ADD COLUMN IF NOT EXISTS quality_label text,
  ADD COLUMN IF NOT EXISTS solve_time_seconds integer,
  ADD COLUMN IF NOT EXISTS fetch_to_submit_seconds integer,
  ADD COLUMN IF NOT EXISTS efficiency_badge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_judged boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS leaderboard_eligible boolean NOT NULL DEFAULT false;

UPDATE public.ka_submissions
SET
  unlocked = COALESCE(
    unlocked,
    CASE
      WHEN level = 0 THEN true
      ELSE COALESCE(structure_score, 0) >= 25
        AND (COALESCE(coverage_score, 0) + COALESCE(quality_score, 0)) >= 15
    END
  ),
  color_band = COALESCE(
    color_band,
    CASE
      WHEN COALESCE(total_score, 0) >= 90 THEN 'BLUE'
      WHEN COALESCE(total_score, 0) >= 75 THEN 'GREEN'
      WHEN COALESCE(total_score, 0) >= 60 THEN 'YELLOW'
      WHEN COALESCE(total_score, 0) >= 40 THEN 'ORANGE'
      ELSE 'RED'
    END
  ),
  quality_label = COALESCE(
    quality_label,
    CASE
      WHEN COALESCE(total_score, 0) >= 90 THEN 'Exceptional'
      WHEN COALESCE(total_score, 0) >= 75 THEN 'Business Quality'
      WHEN COALESCE(total_score, 0) >= 60 THEN 'Usable'
      WHEN COALESCE(total_score, 0) >= 40 THEN 'Needs Improvement'
      ELSE 'Needs Structure Work'
    END
  ),
  solve_time_seconds = COALESCE(
    solve_time_seconds,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer)
  ),
  fetch_to_submit_seconds = COALESCE(
    fetch_to_submit_seconds,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer)
  ),
  efficiency_badge = COALESCE(
    efficiency_badge,
    CASE level
      WHEN 0 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 60
      WHEN 1 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 300
      WHEN 2 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 480
      WHEN 3 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 600
      WHEN 4 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 720
      WHEN 5 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 900
      WHEN 6 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 1200
      WHEN 7 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 1500
      WHEN 8 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (submitted_at - challenge_started_at)))::integer) <= 1800
      ELSE false
    END
  ),
  ai_judged = COALESCE(ai_judged, level <> 0),
  leaderboard_eligible = COALESCE(
    leaderboard_eligible,
    participant_id IS NOT NULL
      AND level BETWEEN 1 AND 20
      AND (
        COALESCE(structure_score, 0) >= 25
        AND (COALESCE(coverage_score, 0) + COALESCE(quality_score, 0)) >= 15
      )
  )
WHERE
  unlocked IS NULL
  OR color_band IS NULL
  OR quality_label IS NULL
  OR solve_time_seconds IS NULL
  OR fetch_to_submit_seconds IS NULL
  OR ai_judged IS NULL;

CREATE INDEX IF NOT EXISTS idx_ka_submissions_level_leaderboard_eligible
  ON public.ka_submissions (level, submitted_at DESC)
  WHERE leaderboard_eligible = true;

-- ---------------------------------------------------------------------------
-- Leaderboard contract fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_leaderboard
  ADD COLUMN IF NOT EXISTS agent_stack text,
  ADD COLUMN IF NOT EXISTS best_score_on_highest numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_color_band text,
  ADD COLUMN IF NOT EXISTS best_quality_label text,
  ADD COLUMN IF NOT EXISTS solve_time_seconds integer,
  ADD COLUMN IF NOT EXISTS efficiency_badge boolean NOT NULL DEFAULT false;

UPDATE public.ka_leaderboard AS l
SET agent_stack = u.agent_stack
FROM public.ka_users AS u
WHERE u.id = l.participant_id
  AND l.agent_stack IS DISTINCT FROM u.agent_stack;

WITH best_runs AS (
  SELECT DISTINCT ON (s.participant_id, s.level)
    s.participant_id,
    s.level,
    s.total_score,
    s.color_band,
    s.quality_label,
    s.solve_time_seconds,
    s.efficiency_badge,
    s.submitted_at
  FROM public.ka_submissions AS s
  WHERE s.participant_id IS NOT NULL
    AND COALESCE(s.unlocked, false) = true
    AND s.level BETWEEN 1 AND 20
  ORDER BY
    s.participant_id,
    s.level,
    s.total_score DESC NULLS LAST,
    s.solve_time_seconds ASC NULLS LAST,
    s.submitted_at ASC
),
frontier AS (
  SELECT DISTINCT ON (participant_id)
    participant_id,
    level AS highest_level,
    total_score AS best_score_on_highest,
    color_band AS best_color_band,
    quality_label AS best_quality_label,
    solve_time_seconds,
    efficiency_badge
  FROM best_runs
  ORDER BY
    participant_id,
    level DESC,
    total_score DESC NULLS LAST,
    solve_time_seconds ASC NULLS LAST,
    submitted_at ASC
)
UPDATE public.ka_leaderboard AS l
SET
  best_score_on_highest = COALESCE(f.best_score_on_highest, 0),
  best_color_band = f.best_color_band,
  best_quality_label = f.best_quality_label,
  solve_time_seconds = f.solve_time_seconds,
  efficiency_badge = COALESCE(f.efficiency_badge, false)
FROM frontier AS f
WHERE f.participant_id = l.participant_id;

-- ---------------------------------------------------------------------------
-- Seed L0 onboarding challenge
-- ---------------------------------------------------------------------------

INSERT INTO public.ka_challenges (
  level,
  seed,
  variant,
  variant_rubric_hash,
  task_json,
  prompt_md,
  metadata_yaml,
  time_limit_minutes,
  generator_model,
  active
)
VALUES (
  0,
  0,
  'onboarding',
  'l0-no-rubric',
  '{"mode":"onboarding"}'::jsonb,
  '# Kolk Arena Onboarding

Reply with any text that contains `Hello` or `Kolk` (case-insensitive).',
  'mode: onboarding
level: 0
public_beta: true',
  1440,
  'deterministic',
  true
)
ON CONFLICT (level, seed, variant) DO UPDATE
SET
  prompt_md = EXCLUDED.prompt_md,
  task_json = EXCLUDED.task_json,
  metadata_yaml = EXCLUDED.metadata_yaml,
  time_limit_minutes = EXCLUDED.time_limit_minutes,
  active = true;
