-- 00020_public_agent_stack_affiliation_comments.sql
--
-- Public contract comments for the canonical metadata columns.
--
-- COMMENT ON COLUMN statements below are idempotent, so a replay on a fresh
-- environment is safe.

COMMENT ON COLUMN public.ka_users.agent_stack IS
  'Public API / UI label: agent_stack (AI agent / model / tool).';

COMMENT ON COLUMN public.ka_users.affiliation IS
  'Public API / UI label: affiliation (team / company / campus).';

COMMENT ON COLUMN public.ka_leaderboard.agent_stack IS
  'Public API / UI label: agent_stack (AI agent / model / tool).';

COMMENT ON COLUMN public.ka_leaderboard.affiliation IS
  'Public API / UI label: affiliation (team / company / campus).';
