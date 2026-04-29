-- Kolk Arena — Core Schema
-- 6 tables: ka_users, ka_challenges, ka_variant_rubrics, ka_submissions, ka_leaderboard, ka_idempotency_keys

-- ============================================================================
-- 0. Helper: updated_at trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION ka_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. ka_users — Arena participants (standalone auth)
-- ============================================================================

CREATE TABLE public.ka_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  display_name    text,
  affiliation     text,                          -- optional team / company / campus label
  is_verified     boolean NOT NULL DEFAULT false,
  verify_code     text,                          -- 6-digit code, hashed
  verify_expires  timestamptz,                   -- code expiry (15 min)
  token_hash      text,                          -- session token hash (post-verification)
  max_level       int NOT NULL DEFAULT 0,        -- highest level passed (for gating)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER ka_users_updated_at
  BEFORE UPDATE ON public.ka_users
  FOR EACH ROW EXECUTE FUNCTION ka_update_updated_at();

CREATE INDEX idx_ka_users_email ON public.ka_users (email);
CREATE INDEX idx_ka_users_affiliation ON public.ka_users (affiliation) WHERE affiliation IS NOT NULL;

-- ============================================================================
-- 2. ka_variant_rubrics — Server-side rubrics per (level, variant)
-- ============================================================================

CREATE TABLE public.ka_variant_rubrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level           int NOT NULL CHECK (level BETWEEN 1 AND 20),
  variant         text NOT NULL,                 -- e.g. "v1", "v2", "v3"
  rubric_hash     text NOT NULL,                 -- SHA-256 of rubric JSON
  rubric_json     jsonb NOT NULL,                -- full rubric: coverage_field_weights, quality_anchors, ideal_excerpt, penalties
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, variant)
);

CREATE INDEX idx_ka_variant_rubrics_level ON public.ka_variant_rubrics (level) WHERE active = true;

-- ============================================================================
-- 3. ka_challenges — Generated challenge packages (cached, pre-built)
-- ============================================================================

CREATE TABLE public.ka_challenges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level               int NOT NULL CHECK (level BETWEEN 1 AND 20),
  seed                int NOT NULL,
  variant             text NOT NULL,             -- matches ka_variant_rubrics.variant
  variant_rubric_hash text NOT NULL,             -- SHA-256 for audit linkage
  task_json           jsonb NOT NULL,            -- the challenge content (task.json)
  prompt_md           text NOT NULL,             -- the brief (prompt.md)
  metadata_yaml       text NOT NULL,             -- routing envelope (metadata.yaml)
  time_limit_minutes  int NOT NULL DEFAULT 60,
  generator_model     text,                      -- e.g. "grok-4-fast-non-reasoning"
  generated_at        timestamptz NOT NULL DEFAULT now(),
  active              boolean NOT NULL DEFAULT true,
  UNIQUE (level, seed, variant)
);

CREATE INDEX idx_ka_challenges_level_active ON public.ka_challenges (level) WHERE active = true;
CREATE INDEX idx_ka_challenges_level_seed ON public.ka_challenges (level, seed);

-- ============================================================================
-- 4. ka_submissions — Participant submissions
-- Historical note: this initial schema enforced one submission per challenge_id.
-- Later migrations relax that model in favor of session-bound submissions.
-- ============================================================================

CREATE TABLE public.ka_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id        uuid NOT NULL REFERENCES public.ka_challenges(id),
  participant_id      uuid REFERENCES public.ka_users(id),  -- NULL for anonymous L1-L5
  anon_token          text,                      -- IP+cookie hash for anonymous tracking
  idempotency_key     text NOT NULL UNIQUE,

  -- Submission content
  primary_text        text NOT NULL,             -- the agent's output
  repo_url            text,
  commit_hash         text,

  -- Timing
  challenge_started_at timestamptz NOT NULL,
  deadline_utc        timestamptz NOT NULL,
  submitted_at        timestamptz NOT NULL DEFAULT now(),

  -- Scores (filled by evaluator)
  structure_score     numeric(5, 2),             -- Layer 1: 0-40
  coverage_score      numeric(5, 2),             -- Layer 2: 0-30
  quality_score       numeric(5, 2),             -- Layer 3: 0-30
  total_score         numeric(5, 2),             -- sum: 0-100
  field_scores        jsonb,                     -- per-field breakdown
  quality_subscores   jsonb,                     -- tone, clarity, usefulness, business_fit
  flags               text[] DEFAULT '{}',       -- e.g. "prompt_injection", "hallucinated_facts"
  judge_summary       text,                      -- AI judge one-line summary
  judge_model         text,                      -- model used for scoring
  judge_error         boolean DEFAULT false,      -- true if AI judge failed

  -- Constraints
  level               int NOT NULL,              -- denormalized for fast queries
  UNIQUE (challenge_id)                          -- initial v1 rule; superseded by later migrations
);

CREATE INDEX idx_ka_submissions_participant ON public.ka_submissions (participant_id) WHERE participant_id IS NOT NULL;
CREATE INDEX idx_ka_submissions_level ON public.ka_submissions (level);
CREATE INDEX idx_ka_submissions_anon ON public.ka_submissions (anon_token) WHERE anon_token IS NOT NULL;

-- ============================================================================
-- 5. ka_leaderboard — Aggregated rankings (materialized, updated on submit)
-- ============================================================================

CREATE TABLE public.ka_leaderboard (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id      uuid NOT NULL REFERENCES public.ka_users(id) UNIQUE,
  display_name        text,
  affiliation         text,
  total_score         numeric(10, 2) NOT NULL DEFAULT 0,
  levels_completed    int NOT NULL DEFAULT 0,
  highest_level       int NOT NULL DEFAULT 0,
  best_scores         jsonb NOT NULL DEFAULT '{}',  -- { "1": 95.5, "2": 88.0, ... }
  last_submission_at  timestamptz,
  rank                int,                          -- computed on update
  tier                text DEFAULT 'starter',       -- starter/builder/specialist/champion
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ka_leaderboard_rank ON public.ka_leaderboard (rank) WHERE rank IS NOT NULL;
CREATE INDEX idx_ka_leaderboard_affiliation ON public.ka_leaderboard (affiliation) WHERE affiliation IS NOT NULL;
CREATE INDEX idx_ka_leaderboard_total ON public.ka_leaderboard (total_score DESC);

CREATE TRIGGER ka_leaderboard_updated_at
  BEFORE UPDATE ON public.ka_leaderboard
  FOR EACH ROW EXECUTE FUNCTION ka_update_updated_at();

-- ============================================================================
-- 6. ka_idempotency_keys — Replay prevention
-- ============================================================================

CREATE TABLE public.ka_idempotency_keys (
  key_hash    text PRIMARY KEY,                  -- SHA-256 of Idempotency-Key header
  response    jsonb NOT NULL,                    -- cached response body
  status_code int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX idx_ka_idempotency_expires ON public.ka_idempotency_keys (expires_at);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.ka_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ka_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ka_variant_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ka_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ka_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ka_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Challenges: public read (active only)
CREATE POLICY "challenges_public_read" ON public.ka_challenges
  FOR SELECT USING (active = true);

-- Leaderboard: public read
CREATE POLICY "leaderboard_public_read" ON public.ka_leaderboard
  FOR SELECT USING (true);

-- Variant rubrics: server-only (no public read)
-- Access via supabaseAdmin (service role) only

-- Submissions: participants can read their own
CREATE POLICY "submissions_own_read" ON public.ka_submissions
  FOR SELECT USING (participant_id = auth.uid());

-- Users: own profile read
CREATE POLICY "users_own_read" ON public.ka_users
  FOR SELECT USING (id = auth.uid());

-- All writes go through supabaseAdmin (service role) in API routes
-- No direct client writes — server validates everything
