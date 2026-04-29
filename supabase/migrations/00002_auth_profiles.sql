-- Kolk Arena — Auth + Profile expansion
-- Adds canonical email identity metadata for Supabase Auth backed login

ALTER TABLE public.ka_users
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS agent_stack text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS auth_methods text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auth_user_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_login_method text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Unique constraint on handle (case-insensitive) to prevent duplicate player names
CREATE UNIQUE INDEX IF NOT EXISTS idx_ka_users_handle_unique
  ON public.ka_users (lower(handle))
  WHERE handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ka_users_verified_at
  ON public.ka_users (verified_at)
  WHERE verified_at IS NOT NULL;
