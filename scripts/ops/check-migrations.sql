-- Paste this whole block into Supabase SQL Editor → Run.
-- The first SELECT returns 12 rows (00001-00012), one per migration, with
-- "present" (landmark object exists) or "MISSING" (you still need to run it).
-- The DO blocks below probe 00013 through 00020 — watch the NOTICE/WARNING
-- output panel for their status.
--
-- This is a landmark probe, not the supabase_migrations.schema_migrations
-- table, because migrations may have been pasted manually rather than
-- applied via the Supabase CLI.

WITH probes AS (
  SELECT '00001_kolk_arena' AS migration,
         to_regclass('public.ka_users') IS NOT NULL
         AND to_regclass('public.ka_variant_rubrics') IS NOT NULL AS applied
  UNION ALL SELECT '00002_auth_profiles',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_users' AND column_name='handle')
  UNION ALL SELECT '00003_fix_constraints_rls',
         EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='ka_users' AND policyname='users_own_read')
  UNION ALL SELECT '00004_challenge_sessions',
         to_regclass('public.ka_challenge_sessions') IS NOT NULL
  UNION ALL SELECT '00005_session_bound_submissions',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_submissions' AND column_name='challenge_session_id')
  UNION ALL SELECT '00006_indexes_handle',
         EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='idx_ka_users_token_hash')
  UNION ALL SELECT '00007_beta_contract_alignment',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_challenges' AND column_name='color_band')
  UNION ALL SELECT '00008_attempt_token_retry',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_challenge_sessions' AND column_name='attempt_token')
  UNION ALL SELECT '00009_api_tokens',
         to_regclass('public.ka_api_tokens') IS NOT NULL
  UNION ALL SELECT '00010_device_codes',
         to_regclass('public.ka_device_codes') IS NOT NULL
  UNION ALL SELECT '00011_submit_rate_limit',
         to_regclass('public.ka_submit_rate_limit') IS NOT NULL
  UNION ALL SELECT '00012_launch_plan_submission_guards',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_users' AND column_name='pioneer')
         AND to_regclass('public.ka_identity_submit_guard') IS NOT NULL
         AND EXISTS (SELECT 1 FROM pg_proc p
                     JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname='public' AND p.proname='ka_claim_attempt_submit_slot')
)
SELECT
  migration,
  CASE WHEN applied THEN '✓ present' ELSE '✗ MISSING — run this one' END AS status
FROM probes
ORDER BY migration;

-- 00013: ka_claim_attempt_submit_slot does not raise 42702 "ambiguous column reference"
DO $$
DECLARE
  probe record;
BEGIN
  SELECT * INTO probe FROM public.ka_claim_attempt_submit_slot(
    p_attempt_token := 'qa_probe_seed', -- gitleaks:allow synthetic probe value, not a credential
    p_minute_limit := 2,
    p_hour_limit := 20,
    p_retry_cap := 10
  );
  RAISE NOTICE '00013 probe OK: code=%', probe.code;
EXCEPTION
  WHEN undefined_function THEN
    RAISE WARNING '00013 MISSING: ka_claim_attempt_submit_slot does not exist';
  WHEN others THEN
    IF SQLSTATE = '42702' THEN
      RAISE WARNING '00013 NOT APPLIED: column ambiguity still present (SQLSTATE 42702)';
    ELSE
      RAISE WARNING '00013 unexpected SQLSTATE=%: %', SQLSTATE, SQLERRM;
    END IF;
END $$;

-- 00014: ka_leaderboard has country_code
DO $$
BEGIN
  PERFORM country_code FROM public.ka_leaderboard LIMIT 0;
  RAISE NOTICE '00014 probe OK';
EXCEPTION
  WHEN undefined_column THEN
    RAISE WARNING '00014 MISSING: ka_leaderboard.country_code does not exist';
END $$;

-- 00015: ka_submissions has country_code
DO $$
BEGIN
  PERFORM country_code FROM public.ka_submissions LIMIT 0;
  RAISE NOTICE '00015 probe OK';
EXCEPTION
  WHEN undefined_column THEN
    RAISE WARNING '00015 MISSING: ka_submissions.country_code does not exist';
END $$;

-- 00016: launch rate-limit release RPCs exist
--   ka_release_attempt_submit_slot + ka_release_identity_submit_attempt
DO $$
DECLARE
  has_attempt boolean;
  has_identity boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ka_release_attempt_submit_slot'
  ) INTO has_attempt;
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ka_release_identity_submit_attempt'
  ) INTO has_identity;
  IF has_attempt AND has_identity THEN
    RAISE NOTICE '00016 probe OK';
  ELSE
    RAISE WARNING '00016 MISSING: ka_release_attempt_submit_slot=% ka_release_identity_submit_attempt=%',
      has_attempt, has_identity;
  END IF;
END $$;

-- 00017: ka_users.agent_stack column exists (hard-default enforcement)
DO $$
BEGIN
  PERFORM agent_stack FROM public.ka_users LIMIT 0;
  RAISE NOTICE '00017 probe OK';
EXCEPTION
  WHEN undefined_column THEN
    RAISE WARNING '00017 MISSING: ka_users.agent_stack does not exist';
END $$;

-- 00018: ka_brief_showcases table exists
DO $$
BEGIN
  IF to_regclass('public.ka_brief_showcases') IS NOT NULL THEN
    RAISE NOTICE '00018 probe OK';
  ELSE
    RAISE WARNING '00018 MISSING: ka_brief_showcases table does not exist';
  END IF;
END $$;

-- 00019: anonymous leaderboard columns + email-or-anon CHECK constraint
DO $$
DECLARE
  has_users_is_anon boolean;
  has_users_anon_hash boolean;
  has_leaderboard_is_anon boolean;
  has_check boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_users' AND column_name='is_anon')
    INTO has_users_is_anon;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_users' AND column_name='anon_session_hash')
    INTO has_users_anon_hash;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='ka_leaderboard' AND column_name='is_anon')
    INTO has_leaderboard_is_anon;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conname = 'ka_users_email_or_anon'
  ) INTO has_check;
  IF has_users_is_anon AND has_users_anon_hash AND has_leaderboard_is_anon AND has_check THEN
    RAISE NOTICE '00019 probe OK';
  ELSE
    RAISE WARNING '00019 MISSING: ka_users.is_anon=% ka_users.anon_session_hash=% ka_leaderboard.is_anon=% ka_users_email_or_anon=%',
      has_users_is_anon, has_users_anon_hash, has_leaderboard_is_anon, has_check;
  END IF;
END $$;

-- 00020: public-facing agent_stack/affiliation column comments populated
DO $$
DECLARE
  agent_stack_comment text;
BEGIN
  SELECT col_description(
    'public.ka_users'::regclass,
    (SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.ka_users'::regclass AND attname = 'agent_stack')
  ) INTO agent_stack_comment;
  IF agent_stack_comment IS NOT NULL THEN
    RAISE NOTICE '00020 probe OK';
  ELSE
    RAISE WARNING '00020 MISSING: ka_users.agent_stack has no column comment';
  END IF;
END $$;
