-- Kolk Arena — Session-bound submissions
-- Fixes:
--   Replay sessions should be able to submit the same challenge_id
--   Duplicate submits must collapse on challenge_session_id, not challenge_id

ALTER TABLE public.ka_submissions
  ADD COLUMN IF NOT EXISTS challenge_session_id uuid REFERENCES public.ka_challenge_sessions(id);

-- Old per-user challenge uniqueness blocks replay sessions for the same player.
DROP INDEX IF EXISTS idx_ka_submissions_challenge_participant;
DROP INDEX IF EXISTS idx_ka_submissions_challenge_anon;

-- One persisted submission per fetched session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_submissions_session_unique
  ON public.ka_submissions (challenge_session_id)
  WHERE challenge_session_id IS NOT NULL;
