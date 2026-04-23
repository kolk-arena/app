-- Kolk Arena — Personal Access Tokens (machine surface)
--
-- Contract: docs/API_TOKENS.md
-- Governance: docs/BETA_DOC_HIERARCHY.md Tier 1
--
-- Introduces the machine-surface auth primitive. PATs are long-ish-lived
-- opaque secrets prefixed `kat_`, stored as sha256(raw), with explicit
-- scopes. Human login (OAuth / email OTP) still lives on ka_users.

CREATE TABLE IF NOT EXISTS public.ka_api_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.ka_users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  token_hash      text NOT NULL UNIQUE,           -- sha256(raw token)
  token_prefix    text NOT NULL,                  -- first 12 chars for UI display ("kat_abcd1234")
  scopes          text[] NOT NULL DEFAULT '{}',
  client_kind     text NOT NULL DEFAULT 'cli' CHECK (client_kind IN ('cli', 'web', 'device', 'other')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  expires_at      timestamptz,                    -- NULL = never (not recommended)
  revoked_at      timestamptz
);

-- Fast lookups by user (for the /profile listing)
CREATE INDEX IF NOT EXISTS idx_ka_api_tokens_user
  ON public.ka_api_tokens (user_id)
  WHERE revoked_at IS NULL;

-- Fast hash lookup (for resolve-from-bearer)
-- Already covered by UNIQUE on token_hash; add a partial for non-revoked speed
CREATE INDEX IF NOT EXISTS idx_ka_api_tokens_hash_active
  ON public.ka_api_tokens (token_hash)
  WHERE revoked_at IS NULL;

-- RLS: server-only writes via supabaseAdmin. Users may read their own tokens.
ALTER TABLE public.ka_api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ka_api_tokens_own_read" ON public.ka_api_tokens
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM public.ka_users WHERE auth.uid()::text = ANY(auth_user_ids)
    )
  );
