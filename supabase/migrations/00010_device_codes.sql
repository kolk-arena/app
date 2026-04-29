-- Kolk Arena — OAuth 2.0 Device Authorization Grant (RFC 8628 profile)
--
-- Public contract: docs/AUTH_DEVICE_FLOW.md
-- Introduces server-side state for CLI sign-in without manual PAT copy/paste.

CREATE TABLE IF NOT EXISTS public.ka_device_codes (
  device_code          text PRIMARY KEY,
  user_code            text NOT NULL UNIQUE,
  requested_scopes     text[] NOT NULL DEFAULT '{}',
  granted_scopes       text[] NOT NULL DEFAULT '{}',
  client_kind          text NOT NULL DEFAULT 'cli',
  user_id              uuid REFERENCES public.ka_users(id) ON DELETE SET NULL,
  issued_token_id      uuid REFERENCES public.ka_api_tokens(id) ON DELETE SET NULL,
  issued_access_token  text,
  verified_at          timestamptz,
  denied_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL,
  last_polled_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ka_device_codes_user_code
  ON public.ka_device_codes (user_code);

CREATE INDEX IF NOT EXISTS idx_ka_device_codes_expires
  ON public.ka_device_codes (expires_at);

ALTER TABLE public.ka_device_codes ENABLE ROW LEVEL SECURITY;
