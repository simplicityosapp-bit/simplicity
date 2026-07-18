-- ════════════════════════════════════════════════════════════════
-- Migration 0092 — community_events: the community calendar
-- Date: 2026-07-18
-- ════════════════════════════════════════════════════════════════
-- Public events any member can post — meetups, workshops, webinars. Owner's
-- call: ANY community member creates (not admins-only, unlike moderation), and
-- a member can add an event to their own calendar (an in-app calendar_events
-- row; a manual Google push is a later, opt-in step).
--
-- Mirrors community_messages' access shape: readable by members via
-- community_access() (+ always by the creator, so a write's return=
-- representation round-trips), created by any member as themselves, edited /
-- removed by the creator OR an admin — is_community_admin() (0090) is the same
-- moderation gate the room uses, so events and messages moderate alike.
--
-- created_by is server-set (DEFAULT auth.uid()), never client-writable — the
-- per-column GRANT at the bottom is what enforces that, the same discipline
-- 0084/0085 established for the public tables.
--
-- Additive + data-safe: one new table. Nothing existing is touched;
-- calendar_events is NOT altered — an added event is a normal calendar_events
-- row keyed google_event_id = 'community:<id>', a namespace the Google pull
-- sync never matches, so it is never touched by it. Re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS community_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) > 0 AND char_length(title) <= 140),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  location    text CHECK (location IS NULL OR char_length(location) <= 200),
  link        text CHECK (link IS NULL OR (char_length(link) <= 300 AND link ~* '^https?://')),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz CHECK (ends_at IS NULL OR ends_at >= starts_at),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The calendar reads forward from "now" ordered by start; this index serves it.
CREATE INDEX IF NOT EXISTS idx_community_events_starts ON community_events (starts_at);

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;

-- READ — members, plus always your own (return=representation on write).
DROP POLICY IF EXISTS community_events_select ON community_events;
CREATE POLICY community_events_select ON community_events
  FOR SELECT TO authenticated
  USING (community_access() OR created_by = auth.uid());

-- CREATE — any member, as themselves.
DROP POLICY IF EXISTS community_events_insert_own ON community_events;
CREATE POLICY community_events_insert_own ON community_events
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND community_access());

-- EDIT / REMOVE — the creator or an admin (0090's moderation gate).
DROP POLICY IF EXISTS community_events_update ON community_events;
CREATE POLICY community_events_update ON community_events
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR is_community_admin())
  WITH CHECK (created_by = auth.uid() OR is_community_admin());

DROP POLICY IF EXISTS community_events_delete ON community_events;
CREATE POLICY community_events_delete ON community_events
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR is_community_admin());

-- created_by / id / created_at are the server's; grant only the content columns
-- (same argument-into-writability as 0084 — a column is not user-writable until
-- it is granted here by name).
REVOKE INSERT, UPDATE ON community_events FROM authenticated;
GRANT  INSERT (title, description, location, link, starts_at, ends_at) ON community_events TO authenticated;
GRANT  UPDATE (title, description, location, link, starts_at, ends_at) ON community_events TO authenticated;

NOTIFY pgrst, 'reload schema';
