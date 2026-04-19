-- Paste this whole block into Supabase SQL Editor → Run.
-- Returns 12 rows, one per migration, with "present" (landmark object exists)
-- or "MISSING" (you still need to run this migration).
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
