-- Kolk Arena — Add country_code to ka_submissions
--
-- Context: 00014 added country_code to ka_leaderboard so the public leaderboard
-- table can render per-player country flags. The live-activity feed on
-- /leaderboard reads directly from ka_submissions (to include anonymous attempts
-- and registered ones that haven't hit ka_leaderboard yet), and therefore needs
-- its own country_code column.
--
-- Write path: src/app/api/challenge/submit/route.ts — same Vercel edge header
-- (x-vercel-ip-country) already normalized via normalizeCountryCode() for the
-- ka_leaderboard write.
--
-- Safe to run on production: additive column, nullable, default NULL, no
-- backfill. Existing rows stay NULL and the UI falls back to a globe emoji.

ALTER TABLE public.ka_submissions
  ADD COLUMN IF NOT EXISTS country_code varchar(2);

-- No index needed — country_code is not filterable on the activity feed today.
-- Add one later if we expose /api/activity-feed?country=XX.
