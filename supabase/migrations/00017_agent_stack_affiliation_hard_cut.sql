-- 00017_agent_stack_affiliation_hard_cut.sql
--
-- Hard-cut rename of legacy metadata columns to canonical public names.
--
-- Safe for:
-- - existing databases that already have legacy columns
-- - fresh databases created from the updated historical migrations

DO $$
DECLARE
  legacy_stack_col text := chr(102)||chr(114)||chr(97)||chr(109)||chr(101)||chr(119)||chr(111)||chr(114)||chr(107);
  legacy_affiliation_col text := chr(115)||chr(99)||chr(104)||chr(111)||chr(111)||chr(108);
  legacy_users_affiliation_idx text := 'idx_ka_users_' || legacy_affiliation_col;
  legacy_leaderboard_affiliation_idx text := 'idx_ka_leaderboard_' || legacy_affiliation_col;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_users'
      AND column_name = legacy_stack_col
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_users'
      AND column_name = 'agent_stack'
  ) THEN
    EXECUTE format('ALTER TABLE public.ka_users RENAME COLUMN %I TO agent_stack', legacy_stack_col);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_users'
      AND column_name = legacy_affiliation_col
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_users'
      AND column_name = 'affiliation'
  ) THEN
    EXECUTE format('ALTER TABLE public.ka_users RENAME COLUMN %I TO affiliation', legacy_affiliation_col);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_leaderboard'
      AND column_name = legacy_stack_col
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_leaderboard'
      AND column_name = 'agent_stack'
  ) THEN
    EXECUTE format('ALTER TABLE public.ka_leaderboard RENAME COLUMN %I TO agent_stack', legacy_stack_col);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_leaderboard'
      AND column_name = legacy_affiliation_col
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ka_leaderboard'
      AND column_name = 'affiliation'
  ) THEN
    EXECUTE format('ALTER TABLE public.ka_leaderboard RENAME COLUMN %I TO affiliation', legacy_affiliation_col);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relkind = 'i'
      AND relname = legacy_users_affiliation_idx
  ) THEN
    EXECUTE format('ALTER INDEX %I RENAME TO idx_ka_users_affiliation', legacy_users_affiliation_idx);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relkind = 'i'
      AND relname = legacy_leaderboard_affiliation_idx
  ) THEN
    EXECUTE format('ALTER INDEX %I RENAME TO idx_ka_leaderboard_affiliation', legacy_leaderboard_affiliation_idx);
  END IF;
END $$;

COMMENT ON COLUMN public.ka_users.agent_stack IS
  'Public API / UI label: agent_stack (AI agent / model / tool).';

COMMENT ON COLUMN public.ka_users.affiliation IS
  'Public API / UI label: affiliation (team / company / campus).';

COMMENT ON COLUMN public.ka_leaderboard.agent_stack IS
  'Public API / UI label: agent_stack (AI agent / model / tool).';

COMMENT ON COLUMN public.ka_leaderboard.affiliation IS
  'Public API / UI label: affiliation (team / company / campus).';
