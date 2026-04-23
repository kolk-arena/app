-- Kolk Arena — Add missing indexes + handle column on leaderboard

-- #9: Index on ka_users.token_hash for auth lookups
CREATE INDEX IF NOT EXISTS idx_ka_users_token_hash
  ON public.ka_users (token_hash)
  WHERE token_hash IS NOT NULL;

-- #10: GIN index on ka_users.auth_user_ids for array containment queries
CREATE INDEX IF NOT EXISTS idx_ka_users_auth_user_ids
  ON public.ka_users USING GIN (auth_user_ids);

-- #7: Add handle column to ka_leaderboard (denormalized from ka_users)
ALTER TABLE public.ka_leaderboard
  ADD COLUMN IF NOT EXISTS handle text;
