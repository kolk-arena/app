-- Kolk Arena — Fix constraints + RLS policies
-- Fixes:
--   C2: UNIQUE(challenge_id) is globally scoped — blocks multi-user submissions
--   H2: RLS policies use auth.uid() which never matches ka_users.id
-- Historical note: C2 was an intermediate fix. Session-bound replay semantics are
-- finalized later in 00005_session_bound_submissions.sql.

-- ============================================================================
-- C2: Intermediate fix — one-submission-per-challenge per user, not global
-- ============================================================================

-- Drop the global unique constraint
ALTER TABLE public.ka_submissions DROP CONSTRAINT IF EXISTS ka_submissions_challenge_id_key;

-- Add per-user unique constraint (participant_id for registered, anon_token for anonymous)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_submissions_challenge_participant
  ON public.ka_submissions (challenge_id, participant_id)
  WHERE participant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_submissions_challenge_anon
  ON public.ka_submissions (challenge_id, anon_token)
  WHERE anon_token IS NOT NULL;

-- ============================================================================
-- H2: Fix RLS policies to use auth_user_ids array instead of auth.uid() = id
-- ============================================================================

-- ka_users: allow read if Supabase auth UID is in the user's auth_user_ids array
DROP POLICY IF EXISTS "users_own_read" ON public.ka_users;
CREATE POLICY "users_own_read" ON public.ka_users
  FOR SELECT USING (auth.uid()::text = ANY(auth_user_ids));

-- ka_submissions: allow read if participant matches via ka_users lookup
DROP POLICY IF EXISTS "submissions_own_read" ON public.ka_submissions;
CREATE POLICY "submissions_own_read" ON public.ka_submissions
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM public.ka_users WHERE auth.uid()::text = ANY(auth_user_ids)
    )
  );
