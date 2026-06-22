-- ════════════════════════════════════════════════════════════════
-- Migration 0050 — anonymous landing-page funnel events
-- ════════════════════════════════════════════════════════════════
-- Records Simplicity's OWN marketing landing (/) funnel: page views and
-- signup-starts. No PII, no user_id, no cookies — only an event type, a
-- per-tab session id (links view → signup_start within a session) and a
-- timestamp. The "signup completed" funnel stage is derived from auth.users
-- (not stored here), so the table stays fully anonymous.
--
-- Written ONLY by the public `landing-events` edge function (service role)
-- and read ONLY by the `admin` edge function. RLS is ON with NO policy, so
-- anon/authenticated clients can neither read nor write it directly — only
-- the service role (which bypasses RLS) touches it.
--
-- DATA SAFETY: additive — a new table + indexes, no changes to existing data.
-- Idempotent via IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS landing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('view', 'signup_start')),
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_events_created ON landing_events (created_at);
CREATE INDEX IF NOT EXISTS idx_landing_events_type_created ON landing_events (type, created_at);

ALTER TABLE landing_events ENABLE ROW LEVEL SECURITY;
-- No policy on purpose: only the service role (edge functions) bypasses RLS;
-- the public clients are blocked from reading/writing the raw events.

NOTIFY pgrst, 'reload schema';
