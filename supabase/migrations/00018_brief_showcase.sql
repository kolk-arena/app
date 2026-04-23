-- Kolk Arena — ChallengeBrief Preview table
-- Caches AI-generated synthetic preview briefs for the home-page carousel.
-- Refreshed every N minutes (default 60) via Vercel Cron only.
--
-- Idempotency note (2026-04-23): every statement in this file is safe to
-- re-run. `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
-- cover themselves; `CREATE POLICY` predates an IF NOT EXISTS syntax on
-- most Postgres versions, so we use the DROP-IF-EXISTS + CREATE pattern.
-- The auto-index behind `UNIQUE (batch_id, slot_index)` already covers
-- the (batch_id, slot_index) access path; a previous revision also
-- created `idx_ka_brief_showcases_batch` for the same pair — redundant,
-- removed here and cleaned up on live databases by migration 00021.

CREATE TABLE IF NOT EXISTS public.ka_brief_showcases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        text NOT NULL,              -- timestamp-based identifier
  slot_index      int NOT NULL CHECK (slot_index BETWEEN 0 AND 7),
  level           int NOT NULL CHECK (level BETWEEN 2 AND 8),
  source_type     text NOT NULL DEFAULT 'ai',
  title           text NOT NULL,               -- synthetic scenario title
  industry        text,
  ceo_name        text,                        -- fictional requester name
  ceo_title       text,                        -- fictional requester role
  quote           text NOT NULL,               -- request context
  core_needs      text[] NOT NULL DEFAULT '{}', -- scoring focus
  deliverables    text[] NOT NULL DEFAULT '{}', -- output shape
  translations    jsonb NOT NULL DEFAULT '{}', -- {"zh-tw": {request_context, scoring_focus, output_shape}, ...}
  qc_status       text NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'failed')),
  qc_reasons      text[] NOT NULL DEFAULT '{}',
  promoted_at     timestamptz,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  UNIQUE (batch_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_ka_brief_showcases_expires
  ON public.ka_brief_showcases (expires_at);
CREATE INDEX IF NOT EXISTS idx_ka_brief_showcases_promoted
  ON public.ka_brief_showcases (qc_status, promoted_at, generated_at DESC);

ALTER TABLE public.ka_brief_showcases ENABLE ROW LEVEL SECURITY;

-- Service-role only: no public read to prevent leaking unreleased content
DROP POLICY IF EXISTS "brief_showcase_no_public" ON public.ka_brief_showcases;
CREATE POLICY "brief_showcase_no_public" ON public.ka_brief_showcases
  FOR ALL USING (false);
