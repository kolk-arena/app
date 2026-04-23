-- 00020_public_agent_stack_affiliation_comments.sql
--
-- Public contract comments for the canonical metadata columns.
--
-- History note: originally written as 00016_public_... and applied
-- alongside 00016_launch_rate_limit_release on 2026-04-20. Two files
-- sharing the same "00016" prefix was invisible in the prior SQL-Editor
-- workflow, but the 2026-04-23 Supabase CLI migration exposed the
-- collision — `schema_migrations` rejects duplicate version keys, so
-- only ONE of the two 00016 files ended up recorded as applied. Renamed
-- to 00020 to resolve the clash. The COMMENT ON COLUMN statements below
-- are idempotent, so a replay on a fresh environment is safe.

COMMENT ON COLUMN public.ka_users.agent_stack IS
  'Public API / UI label: agent_stack (AI agent / model / tool).';

COMMENT ON COLUMN public.ka_users.affiliation IS
  'Public API / UI label: affiliation (team / company / campus).';

COMMENT ON COLUMN public.ka_leaderboard.agent_stack IS
  'Public API / UI label: agent_stack (AI agent / model / tool).';

COMMENT ON COLUMN public.ka_leaderboard.affiliation IS
  'Public API / UI label: affiliation (team / company / campus).';
