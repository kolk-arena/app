-- Kolk Arena — Anonymous L1+ leaderboard eligibility
--
-- Before this migration, ka_leaderboard.participant_id is a NOT NULL FK to
-- ka_users, so only verified users can appear on the public leaderboard.
-- The launch-day requirement is that anonymous players (those playing L1-L5
-- through the browser's kolk_anon_session cookie) also rank, and that
-- different anonymous browsers stay distinguishable from each other.
--
-- Approach: anonymous players get a lightweight ka_users row keyed on the
-- sha256 hash of their kolk_anon_session cookie. The row carries is_anon=true,
-- email=NULL, and a stable short label ("Anonymous a4c7" where a4c7 is the
-- first 4 chars of the anon_session_hash). On sign-up the same id can be
-- upgraded to a verified account without losing submission history.
--
-- Canonical anonymous identity: the server-issued kolk_anon_session cookie.
-- Clearing cookies or switching browsers intentionally creates a new row —
-- we are NOT trying to merge sibling browsers for the same human, just to
-- prevent collapsing distinct players into a single "Anonymous" line.

-- ---------------------------------------------------------------------------
-- 1. ka_users: email becomes nullable for anonymous rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_users
  ALTER COLUMN email DROP NOT NULL;

-- Replace the column-level UNIQUE(email) with a partial unique index so
-- multiple anonymous rows with email=NULL do not collide. Verified users
-- still collide by email as before.
ALTER TABLE public.ka_users
  DROP CONSTRAINT IF EXISTS ka_users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_users_email_unique
  ON public.ka_users (email)
  WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. ka_users: anonymous-identity discriminator columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_users
  ADD COLUMN IF NOT EXISTS is_anon boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anon_session_hash text;

-- One ka_users row per anonymous cookie. NULL hashes (verified users)
-- never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_users_anon_session_hash_unique
  ON public.ka_users (anon_session_hash)
  WHERE anon_session_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ka_users_is_anon
  ON public.ka_users (is_anon) WHERE is_anon = true;

-- ---------------------------------------------------------------------------
-- 3. Invariant: every row is either a verified/claimable email account or
--    an anonymous row with a session hash. Empty rows are rejected.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_users
  DROP CONSTRAINT IF EXISTS ka_users_email_or_anon;

ALTER TABLE public.ka_users
  ADD CONSTRAINT ka_users_email_or_anon CHECK (
    email IS NOT NULL
    OR (is_anon = true AND anon_session_hash IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 4. ka_leaderboard: surface is_anon so the public ranking UI can render
--    anonymous rows with a distinct pill without an extra join.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ka_leaderboard
  ADD COLUMN IF NOT EXISTS is_anon boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ka_leaderboard_is_anon
  ON public.ka_leaderboard (is_anon) WHERE is_anon = true;

-- Backfill in case any leaderboard rows were synthesized before this
-- migration ran; in practice this is a no-op on fresh installs.
UPDATE public.ka_leaderboard AS l
SET is_anon = u.is_anon
FROM public.ka_users AS u
WHERE u.id = l.participant_id
  AND u.is_anon = true
  AND l.is_anon = false;
