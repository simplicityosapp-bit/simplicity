-- ════════════════════════════════════════════════════════════════
-- Migration 0087 — community_message_reactions: emoji reactions
-- Date: 2026-07-18
-- ════════════════════════════════════════════════════════════════
-- Lightweight engagement on a message: a member toggles an emoji on/off.
-- One row = one (message, member, emoji). Toggling off is a real DELETE (a
-- reaction, unlike a message, is meant to be taken back), so this table has an
-- authenticated DELETE policy where community_messages deliberately does not.
--
-- Additive + data-safe: one new table, its RLS, grants, and realtime — nothing
-- in 0080-0086 is touched. Re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Table ────────────────────────────────────────────────────────────────
-- message_id → community_messages: a reaction dies with its message (CASCADE),
-- and this FK is also what lets PostgREST embed reactions under a message
-- (select=…,community_message_reactions(...)). user_id → auth.users, like the
-- other user-owned tables.
--
-- The UNIQUE(message_id, user_id, emoji) makes a react idempotent — the same
-- member can't stack the same emoji twice — and its btree indexes message_id
-- (leftmost prefix), which serves the embed lookup, so no extra index.
--
-- emoji is guarded by LENGTH only, not by an allow-list: the 5-emoji palette is
-- defined and enforced in the app (src) so it can grow without a migration; the
-- DB's job here is just to refuse essays (abuse). 16 chars covers multi-codepoint
-- emoji (ZWJ sequences, flags, skin-tone modifiers). If a server-enforced set is
-- ever wanted, add a CHECK or a lookup table like community_reserved_names.
CREATE TABLE IF NOT EXISTS community_message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid()
               REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(btrim(emoji)) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_message_reactions_uniq UNIQUE (message_id, user_id, emoji)
);

-- Reverse lookup (all of a member's reactions) for the cascade + any future
-- "my reactions" view; the message_id side rides the UNIQUE index above.
CREATE INDEX IF NOT EXISTS idx_community_reactions_user ON community_message_reactions (user_id);

-- ── 2) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE community_message_reactions ENABLE ROW LEVEL SECURITY;

-- Read reactions if you can see the room — same lever as the messages (0080).
DROP POLICY IF EXISTS community_reactions_select_members ON community_message_reactions;
CREATE POLICY community_reactions_select_members ON community_message_reactions
  FOR SELECT TO authenticated USING (community_access());

-- React as yourself, in a room you're in.
DROP POLICY IF EXISTS community_reactions_insert_own ON community_message_reactions;
CREATE POLICY community_reactions_insert_own ON community_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND community_access());

-- Un-react: remove your OWN reaction. This is the toggle-off, and it is the one
-- place community content is user-deletable (a message is append-only; a
-- reaction is not history worth keeping).
DROP POLICY IF EXISTS community_reactions_delete_own ON community_message_reactions;
CREATE POLICY community_reactions_delete_own ON community_message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- No UPDATE policy: a reaction is insert-or-delete, never edited.

-- ── 3) Column grants (mirror 0085) ──────────────────────────────────────────
-- Narrow the default table-wide INSERT to the columns a client may set, so
-- id/created_at stay server-owned. DELETE stays table-wide (RLS scopes it to
-- own rows). ⚠️ A column added later isn't insertable until granted here.
REVOKE INSERT ON community_message_reactions FROM authenticated;
GRANT  INSERT (message_id, user_id, emoji) ON community_message_reactions TO authenticated;

-- ── 4) Realtime ─────────────────────────────────────────────────────────────
-- Counts must update live, so publish INSERT *and* DELETE. Unlike
-- community_messages (0081, left at default REPLICA IDENTITY because it only
-- ever INSERTs), a reaction DELETE has to tell every client WHICH (message,
-- user, emoji) was removed — and the default PK-only old-row payload carries
-- just `id`. REPLICA IDENTITY FULL ships the whole old row on DELETE so the
-- client can decrement the right message's right emoji. It makes writes a touch
-- heavier; reactions are tiny, so that is fine.
ALTER TABLE community_message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
    RAISE NOTICE 'supabase_realtime did not exist — created it (empty).';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables) THEN
    RAISE NOTICE 'supabase_realtime is FOR ALL TABLES — community_message_reactions already covered.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'community_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_message_reactions;
    RAISE NOTICE 'community_message_reactions added to supabase_realtime.';
  ELSE
    RAISE NOTICE 'community_message_reactions already in supabase_realtime — nothing to do.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
