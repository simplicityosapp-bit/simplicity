-- ════════════════════════════════════════════════════════════════
-- Migration 0081 — community_messages: soft delete + realtime
-- Date: 2026-07-17
-- ════════════════════════════════════════════════════════════════
-- Two additions to the room built in 0080:
--   1. `deleted_at` — a moderation lever. A removed message stays in the
--      table (auditable, restorable) but disappears from the room.
--   2. `community_messages` joins the supabase_realtime publication so the
--      chat UI can subscribe to live INSERTs.
--
-- Additive + data-safe: one nullable column, one policy REPLACED in place
-- (same name), one publication membership added. No column, table, or
-- function is dropped or rewritten; 0080 itself is untouched. Re-running is
-- a no-op (ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS / guarded DO).
--
-- ⚠️  WHO CAN SOFT-DELETE? Nobody, from the browser. 0080 deliberately gave
--     `authenticated` no UPDATE policy (the room is append-only), and this
--     migration does not add one. So `deleted_at` is writable ONLY by the
--     service-role — i.e. moderation through an edge function, exactly as
--     0080 anticipated. If the product wants "unsend your own message",
--     that is a SEPARATE, deliberate policy (see the note at the bottom) —
--     it is not something this migration should smuggle in.
-- ════════════════════════════════════════════════════════════════

-- ── 1) The column ───────────────────────────────────────────────────────────
-- Nullable, no default: every existing row stays NULL = live. Matches the
-- `deleted_at timestamptz` shape used by ~26 tables across the schema.
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ── 2) Hide soft-deleted rows — AT THE POLICY LEVEL (a deliberate deviation) ─
-- ⚠️  This is NOT how the rest of the repo filters soft-deletes, and the
--     difference is intentional. Read this before "fixing" it for consistency.
--
--     Everywhere else (clients, goals, tasks, …) RLS checks ownership ONLY
--     — `USING (user_id = auth.uid())` — and `deleted_at IS NULL` is applied
--     by the QUERY layer (`.is('deleted_at', null)` in src/lib/api/*.js).
--     That is not sloppiness; it is required there: those tables back a
--     30-day Trash + restore flow (see listTrashed/restore in
--     src/lib/api/clients.js), so the owner MUST still be able to read their
--     own deleted rows. An RLS filter would make Trash impossible.
--
--     community_messages inverts every part of that reasoning:
--       • No trash, no restore, no user-facing undelete — so nothing needs
--         to read a deleted row except the service-role, which bypasses RLS
--         entirely and can still audit/restore.
--       • The rows are OTHER PEOPLE'S content, not the reader's own data.
--         Everywhere else, a soft-deleted row is something you already had
--         the right to see. Here, a soft-deleted row is content that was
--         REMOVED FROM YOU. That is the whole point of moderation.
--       • Client-side filtering is not a control — it is a suggestion.
--         PostgREST is a public API: with app-layer filtering only, any user
--         could request ?deleted_at=not.is.null and read back exactly the
--         content moderation just removed. The filter has to be server-side
--         or it does not exist.
--
--     So: ownership-only RLS + app-layer filter is right for PRIVATE data
--     with a trash can. Policy-level filter is right for SHARED data with
--     moderation. Same column, different threat model.
--
-- Replaces (does not duplicate) the 0080 policy of the same name; the runner
-- wraps the file in one transaction, and RLS defaults to deny when no policy
-- matches, so there is no window where the room is readable unfiltered.
-- NOTE: 0080's file still shows this policy WITHOUT the deleted_at clause.
-- That file is history and stays as-is — THIS is the live definition.
DROP POLICY IF EXISTS community_messages_select_members ON community_messages;
CREATE POLICY community_messages_select_members ON community_messages
  FOR SELECT TO authenticated
  USING (community_access() AND deleted_at IS NULL);

-- community_access() is still the one swappable lever from 0080 (see that
-- file's header for the subscription gate). `deleted_at IS NULL` is a
-- separate, permanent condition ANDed onto it — the two never interact.

-- No new index. The room feed (created_at DESC, deleted_at IS NULL) is served
-- by 0080's idx_community_messages_created_at; a partial index would only
-- matter once deleted rows are a meaningful fraction of the table, which
-- moderation should never make true. Revisit if the room gets big.

-- ── 3) Realtime ─────────────────────────────────────────────────────────────
-- Nothing in this repo has ever touched a publication — community_messages is
-- the first realtime table — so this block assumes NOTHING about the live
-- state and is written to be safe in every case.
--
-- SCOPING: `ALTER PUBLICATION … ADD TABLE` is strictly additive. It appends
-- one table and leaves every existing member untouched. (The destructive form
-- is `SET TABLE …`, which REPLACES the whole list — deliberately not used
-- here, and it must never be: it would silently unpublish everything else.)
DO $$
BEGIN
  -- Supabase ships this publication, so this branch should never fire. It
  -- exists so the migration can't fail on a project where it was removed.
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
    RAISE NOTICE 'supabase_realtime did not exist — created it (empty).';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime' AND puballtables) THEN
    -- FOR ALL TABLES publications cover the table already, and rejecting
    -- ADD TABLE is a hard error — so skip rather than fail.
    RAISE NOTICE 'supabase_realtime is FOR ALL TABLES — community_messages is already published.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'community_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
    RAISE NOTICE 'community_messages added to supabase_realtime.';
  ELSE
    RAISE NOTICE 'community_messages already in supabase_realtime — nothing to do.';
  END IF;
END $$;

-- REPLICA IDENTITY is left at the default (primary key) on purpose. The UI
-- subscribes to INSERTs, and an INSERT payload always carries the full new
-- row. REPLICA IDENTITY FULL is only needed to receive the OLD row on
-- UPDATE/DELETE, which nothing here does — and it makes every write heavier.
--
-- ⚠️  KNOWN CONSEQUENCE for the UI sub-task — realtime + the policy above:
--     Realtime re-checks the SELECT policy per subscriber before delivering a
--     change. When moderation sets deleted_at, the updated row STOPS passing
--     `deleted_at IS NULL`, so the UPDATE event is filtered out and clients
--     never hear about it — the message lingers on screen until the next
--     refetch. That is the accepted cost of making the filter real (see the
--     long note in §2): moderation is enforced everywhere immediately, but
--     propagates live nowhere. If instant removal is ever required, the fix
--     is a broadcast/"message_removed" channel — NOT weakening the policy.

-- ── Not done here, on purpose ───────────────────────────────────────────────
-- "Unsend my own message" would be, in full:
--     CREATE POLICY community_messages_soft_delete_own ON community_messages
--       FOR UPDATE TO authenticated
--       USING (user_id = auth.uid() AND deleted_at IS NULL)
--       WITH CHECK (user_id = auth.uid());
-- Not added: it is a product decision (0080 chose append-only), and on its
-- own it is also NOT SAFE — a FOR UPDATE policy lets the author rewrite
-- `content` too, silently editing history. Doing it properly needs a column
-- guard (trigger or a restrictive policy) so only deleted_at may change.

NOTIFY pgrst, 'reload schema';
