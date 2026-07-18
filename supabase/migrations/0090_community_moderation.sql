-- ════════════════════════════════════════════════════════════════
-- Migration 0090 — community moderation (admin-only, v1)
-- Date: 2026-07-18
-- ════════════════════════════════════════════════════════════════
-- Three tools, all gated on the app's EXISTING admin definition (super-owner by
-- email, or app_metadata.role = 'admin' — set only by the admin edge function):
--   • pin a message (pinned_at) — announcements at the top of the room
--   • admin-delete ANY message — soft-delete, to remove abuse
--   • member reports → an admin-only queue
--
-- Dedicated "community moderators" (non-admins with granular powers) are a
-- deliberately-later stage — v1 reuses the admin system wholesale.
--
-- Additive + data-safe. Nothing in 0080-0089 is dropped or rewritten; the new
-- admin UPDATE policy ADDS to (OR-s with) 0083's owner soft-delete. Re-running
-- is a no-op.
-- ════════════════════════════════════════════════════════════════

-- ── 1) The admin check, in SQL ──────────────────────────────────────────────
-- Mirrors lib/admin.js / the admin edge: the JWT's app_metadata.role = 'admin'
-- (promoted admins) OR the hardcoded super-owner email (never metadata-stamped).
-- app_metadata is writable ONLY by the service_role, so this can't be spoofed
-- from the browser. STABLE + reads auth.jwt() (schema-qualified, so search_path
-- can stay empty per 0045). The owner email is duplicated from routes.js /
-- functions/admin — same value, three enforcement points.
CREATE OR REPLACE FUNCTION is_community_admin()
  RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'simplicity.os.app@gmail.com'
$$;

-- ── 2) Pin + admin-delete: an admin may moderate any message ────────────────
-- pinned_at: NULL = not pinned. Nullable, no default — every existing row stays
-- unpinned. It is NOT frozen by 0083's guard_immutable_columns (that guards
-- id/user_id/content/created_at only), so it — and deleted_at — are exactly the
-- two things this policy can change. So an admin can pin and remove, but the
-- immutable trigger still stops ANYONE (admin included) rewriting message text.
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

-- Permissive UPDATE for admins, on ANY row. OR-s with 0083's owner soft-delete:
-- an update passes if you're the owner deleting your own, OR you're an admin.
-- authenticated already holds table-wide UPDATE (0085 only narrowed INSERT), so
-- no grant is needed; RLS + the immutable trigger are the real gate.
DROP POLICY IF EXISTS community_messages_admin_moderate ON community_messages;
CREATE POLICY community_messages_admin_moderate ON community_messages
  FOR UPDATE TO authenticated
  USING (is_community_admin())
  WITH CHECK (is_community_admin());

-- Pinned lookups (the room shows pinned first). Partial: only pinned rows.
CREATE INDEX IF NOT EXISTS idx_community_messages_pinned
  ON community_messages (pinned_at)
  WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;

-- ── 3) Reports — a member flags a message into an admin queue ────────────────
CREATE TABLE IF NOT EXISTS community_message_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_message_reports_uniq UNIQUE (message_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_community_reports_message ON community_message_reports (message_id);

ALTER TABLE community_message_reports ENABLE ROW LEVEL SECURITY;

-- A member files a report as themselves. UNIQUE stops double-reporting.
DROP POLICY IF EXISTS community_reports_insert_own ON community_message_reports;
CREATE POLICY community_reports_insert_own ON community_message_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND community_access());

-- Only admins read the queue (a member can't see who reported what) …
DROP POLICY IF EXISTS community_reports_select_admin ON community_message_reports;
CREATE POLICY community_reports_select_admin ON community_message_reports
  FOR SELECT TO authenticated USING (is_community_admin());

-- … and only admins clear it (resolve = delete the report rows).
DROP POLICY IF EXISTS community_reports_delete_admin ON community_message_reports;
CREATE POLICY community_reports_delete_admin ON community_message_reports
  FOR DELETE TO authenticated USING (is_community_admin());

REVOKE INSERT ON community_message_reports FROM authenticated;
GRANT  INSERT (message_id, reporter_id, reason) ON community_message_reports TO authenticated;

NOTIFY pgrst, 'reload schema';
