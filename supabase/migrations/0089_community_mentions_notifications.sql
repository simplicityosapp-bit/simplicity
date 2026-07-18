-- ════════════════════════════════════════════════════════════════
-- Migration 0089 — @mentions + in-app notifications
-- Date: 2026-07-18
-- ════════════════════════════════════════════════════════════════
-- Two tables and a trigger:
--   • community_message_mentions — who a message @-tags. The author writes
--     these; a nested FK to community_profiles lets the feed embed the
--     mentioned member's name for highlighting.
--   • community_notifications — what's waiting for a member (mentions today,
--     room to grow: replies, reactions). Members only ever READ their own +
--     mark them read; they are NEVER inserted by a client — a SECURITY DEFINER
--     trigger creates them, so nobody can spam a notification at someone else.
--
-- Additive + data-safe. Nothing in 0080-0088 is touched. Re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Mentions ─────────────────────────────────────────────────────────────
-- mentioned_user_id → community_profiles.user_id (UNIQUE since 0082), NOT
-- auth.users: a mention always targets a community MEMBER, and this FK is what
-- lets the feed embed the mentioned name
-- (community_message_mentions(mentioned_user_id, community_profiles(display_name)))
-- for the @-highlight. CASCADE so a mention dies with its message or its member.
CREATE TABLE IF NOT EXISTS community_message_mentions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES community_profiles(user_id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_message_mentions_uniq UNIQUE (message_id, mentioned_user_id)
);
-- "mentions of me" + the cascade side; message_id rides the UNIQUE index.
CREATE INDEX IF NOT EXISTS idx_community_mentions_user ON community_message_mentions (mentioned_user_id);

ALTER TABLE community_message_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_mentions_select_members ON community_message_mentions;
CREATE POLICY community_mentions_select_members ON community_message_mentions
  FOR SELECT TO authenticated USING (community_access());

-- Insert a mention ONLY on your own message — you can't forge "X mentioned Y".
DROP POLICY IF EXISTS community_mentions_insert_author ON community_message_mentions;
CREATE POLICY community_mentions_insert_author ON community_message_mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    community_access()
    AND EXISTS (SELECT 1 FROM community_messages m WHERE m.id = message_id AND m.user_id = auth.uid())
  );

REVOKE INSERT ON community_message_mentions FROM authenticated;
GRANT  INSERT (message_id, mentioned_user_id) ON community_message_mentions TO authenticated;

-- ── 2) Notifications ────────────────────────────────────────────────────────
-- type is an open enum (CHECK) so replies/reactions can join later. actor_id
-- SET NULL (the notice survives if the actor's account goes). read_at NULL =
-- unread.
-- actor_id → community_profiles.user_id (not auth.users) so the notification
-- list can embed the actor's public name (community_profiles(display_name)) in
-- the same query. The actor is always a member (they posted → they have a
-- profile). SET NULL keeps the notice if their account/profile goes.
CREATE TABLE IF NOT EXISTS community_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES community_profiles(user_id) ON DELETE SET NULL,
  type         text NOT NULL CHECK (type IN ('mention')),
  message_id   uuid REFERENCES community_messages(id) ON DELETE CASCADE,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- The unread-badge query (recipient + unread + newest-first).
CREATE INDEX IF NOT EXISTS idx_community_notifications_recipient
  ON community_notifications (recipient_id, created_at DESC);

ALTER TABLE community_notifications ENABLE ROW LEVEL SECURITY;

-- Read your own notifications.
DROP POLICY IF EXISTS community_notifications_select_own ON community_notifications;
CREATE POLICY community_notifications_select_own ON community_notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());

-- Mark them read (only read_at is meant to change; the app never sends the
-- others, and a column guard would be the follow-up if that needs enforcing).
DROP POLICY IF EXISTS community_notifications_update_own ON community_notifications;
CREATE POLICY community_notifications_update_own ON community_notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());
-- Deliberately NO insert/delete policy for authenticated: notifications are
-- born server-side (trigger below), so a member can't fabricate one for anyone.

-- ── 3) The trigger — a mention makes a notification ─────────────────────────
-- SECURITY DEFINER so it can INSERT into community_notifications despite there
-- being no authenticated INSERT policy — that is the whole point: the ONLY way
-- a notification is created is the system reacting to a real mention. Skips a
-- self-mention (no "you mentioned yourself"). search_path pinned per 0045.
CREATE OR REPLACE FUNCTION community_notify_on_mention()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  author_id uuid;
BEGIN
  SELECT user_id INTO author_id FROM community_messages WHERE id = NEW.message_id;
  IF NEW.mentioned_user_id IS DISTINCT FROM author_id THEN
    INSERT INTO community_notifications (recipient_id, actor_id, type, message_id)
    VALUES (NEW.mentioned_user_id, author_id, 'mention', NEW.message_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_community_notify_mention ON community_message_mentions;
CREATE TRIGGER trg_community_notify_mention
  AFTER INSERT ON community_message_mentions
  FOR EACH ROW EXECUTE FUNCTION community_notify_on_mention();

-- ── 4) Realtime — live unread badge ─────────────────────────────────────────
-- Publish community_notifications so a mention lights up the recipient's badge
-- without a refetch (Realtime re-checks the SELECT policy per subscriber, so a
-- member only ever receives their OWN). Default REPLICA IDENTITY is fine: we
-- react to INSERT (new notice) and to the mark-read UPDATE, and postgres_changes
-- ships the full NEW row on both regardless of replica identity. Mentions
-- themselves aren't published — they ride their message, and the highlight is
-- cosmetic (fills in on the next fetch for a realtime-arrived message).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables) THEN
    RAISE NOTICE 'supabase_realtime is FOR ALL TABLES — community_notifications already covered.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'community_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_notifications;
    RAISE NOTICE 'community_notifications added to supabase_realtime.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
