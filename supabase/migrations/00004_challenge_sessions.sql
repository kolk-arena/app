-- Kolk Arena — Challenge Sessions
-- Binds each fetch to a user, records server-side start time,
-- provides a fetch_token nonce for submit verification.

CREATE TABLE public.ka_challenge_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    uuid NOT NULL REFERENCES public.ka_challenges(id),
  participant_id  uuid REFERENCES public.ka_users(id),
  anon_token      text,
  fetch_token     text NOT NULL UNIQUE,        -- opaque nonce returned to client, required on submit
  started_at      timestamptz NOT NULL DEFAULT now(),
  deadline_utc    timestamptz NOT NULL,
  submitted       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups
CREATE INDEX idx_ka_cs_fetch_token ON public.ka_challenge_sessions (fetch_token);
CREATE INDEX idx_ka_cs_participant ON public.ka_challenge_sessions (participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX idx_ka_cs_anon ON public.ka_challenge_sessions (anon_token) WHERE anon_token IS NOT NULL;
CREATE INDEX idx_ka_cs_challenge ON public.ka_challenge_sessions (challenge_id);

-- RLS
ALTER TABLE public.ka_challenge_sessions ENABLE ROW LEVEL SECURITY;

-- Server-only writes (via supabaseAdmin)
-- Participants can read their own sessions
CREATE POLICY "cs_own_read" ON public.ka_challenge_sessions
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM public.ka_users WHERE auth.uid()::text = ANY(auth_user_ids)
    )
  );
