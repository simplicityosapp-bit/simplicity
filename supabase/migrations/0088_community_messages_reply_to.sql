-- ════════════════════════════════════════════════════════════════
-- Migration 0088 — community_messages: reply_to_id (one-level threads)
-- Date: 2026-07-18
-- ════════════════════════════════════════════════════════════════
-- A reply points at the message it answers. The product model is FLAT: every
-- reply attaches to the TOP-LEVEL (root) message, so replying to a reply still
-- lands under the same root — one level, never a tree. The app computes that
-- root before inserting (reply_to_id := target.reply_to_id ?? target.id); the
-- column here is a plain self-FK and does not itself forbid pointing at a
-- reply. Enforcing single-level in the DB would need a trigger; the app owns
-- that invariant for now (a trigger is the follow-up if it's ever wanted).
--
-- Additive + data-safe: one nullable column, one grant, one partial index.
-- Nothing in 0080-0087 is touched; existing messages get reply_to_id = NULL
-- (i.e. all become top-level, which is correct). Re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

-- Self-FK. ON DELETE SET NULL, not CASCADE: a reply is usually authored by a
-- DIFFERENT member than the parent, so if the parent's row is ever HARD-deleted
-- (only via account-deletion cascade — soft-delete leaves the row in place),
-- the reply should survive as a top-level message rather than be destroyed
-- because someone else left. (Soft-deleting a parent just hides it + its thread
-- from the feed via 0081's SELECT policy; the rows stay and reply_to_id stays
-- valid.)
ALTER TABLE community_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES community_messages(id) ON DELETE SET NULL;

-- 0085 revoked table-wide INSERT and grants columns one by one, so a new column
-- is NOT client-insertable until granted — exactly the fail-closed cost 0085
-- documented. Without this line, sending reply_to_id is a 42501.
GRANT INSERT (reply_to_id) ON community_messages TO authenticated;

-- Cheap lookup of "all replies to message X" (the thread), and it keeps the
-- top-level feed filter (reply_to_id IS NULL) off a seq scan. Partial: only
-- replies carry the column, top-level rows are NULL and not worth indexing.
CREATE INDEX IF NOT EXISTS idx_community_messages_reply_to
  ON community_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
