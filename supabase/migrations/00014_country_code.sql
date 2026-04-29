-- #14: Add country_code tracking for players

ALTER TABLE public.ka_users
  ADD COLUMN IF NOT EXISTS country_code varchar(2);

ALTER TABLE public.ka_leaderboard
  ADD COLUMN IF NOT EXISTS country_code varchar(2);

-- Backfill country_code from users if any exists
UPDATE public.ka_leaderboard AS l
SET country_code = u.country_code
FROM public.ka_users AS u
WHERE u.id = l.participant_id
  AND l.country_code IS DISTINCT FROM u.country_code;
