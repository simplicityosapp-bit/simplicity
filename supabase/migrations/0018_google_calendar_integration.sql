-- ════════════════════════════════════════════════════════════════
-- Migration 0018 — Google Calendar integration
-- Date: 2026-06-07
-- ════════════════════════════════════════════════════════════════
-- Two tables for a one-way Google Calendar → Simplicity sync.
--
-- SECURITY MODEL (the important part):
--   `user_integrations` holds OAuth tokens (access + refresh). RLS is
--   ENABLED with NO policy for the `authenticated` role — so the browser
--   (anon key + a user session) can NEVER read a token, even its own.
--   Only the Edge Functions, which use the service-role key (bypasses
--   RLS), read/write this table. The UI learns "connected? / sync_from /
--   last_synced_at" by calling the `google-calendar` function (action=
--   status), never by reading the table.
--
--   `calendar_events` carries no secret, so it IS client-readable on the
--   user's own rows — the UI lists events and lets the user assign a
--   client manually (client_id + matched_manually). The sync upsert is
--   done by the Edge Function (service role).
--
-- Additive + data-preserving: two new tables only, nothing else touched.
-- Re-running is a no-op (IF NOT EXISTS / DROP-then-CREATE on policy+trigger).
-- ════════════════════════════════════════════════════════════════

-- ── user_integrations — SERVICE-ROLE ONLY ──────────────────────
CREATE TABLE IF NOT EXISTS user_integrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider       text NOT NULL DEFAULT 'google_calendar',
  access_token   text,
  refresh_token  text,
  token_expiry   timestamptz,
  sync_from      date,                 -- user-chosen start (up to a year back)
  sync_token     text,                 -- Google nextSyncToken — incremental sync
  last_synced_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_integrations_user_provider_uniq UNIQUE (user_id, provider)
);

-- ── calendar_events — client-readable own rows ─────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id  text NOT NULL,
  client_id        uuid REFERENCES clients(id) ON DELETE SET NULL,
  title            text,
  start_time       timestamptz,
  end_time         timestamptz,
  all_day          boolean NOT NULL DEFAULT false,
  duration_minutes integer,
  confidence_score real,               -- 0..1, higher = better match (1 − fuse score)
  matched_manually boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,        -- set when the Google event is cancelled
  CONSTRAINT calendar_events_user_event_uniq UNIQUE (user_id, google_event_id)
);

-- ── Row Level Security ─────────────────────────────────────────
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
-- NOTE: intentionally NO policy for `authenticated` — tokens are
-- service-role-only. Do not add a client-facing policy to this table.

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_events_own ON calendar_events;
CREATE POLICY calendar_events_own ON calendar_events
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── updated_at triggers ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_user_integrations_updated ON user_integrations;
CREATE TRIGGER trg_user_integrations_updated BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_calendar_events_updated ON calendar_events;
CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_integrations_user ON user_integrations (user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user   ON calendar_events (user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start  ON calendar_events (start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client ON calendar_events (client_id);

NOTIFY pgrst, 'reload schema';
