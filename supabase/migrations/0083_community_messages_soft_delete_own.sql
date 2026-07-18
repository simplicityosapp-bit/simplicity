-- ════════════════════════════════════════════════════════════════
-- Migration 0083 — community_messages: let an author unsend their own message
-- Date: 2026-07-17
-- ════════════════════════════════════════════════════════════════
-- 0080 made the room append-only (no UPDATE policy at all). 0081 added
-- `deleted_at`, writable only by the service-role, and closed with a note
-- that the obvious "unsend" policy is NOT SAFE on its own. This migration is
-- that note, done properly: the policy PLUS the column guard it needs.
--
-- The one thing an author gains: flipping their OWN live message to deleted.
-- Nothing else. Not editing, not un-deleting, not touching anyone else's row.
--
-- ─── WHY A TRIGGER, AND NOT RLS ALONE ───────────────────────────────────────
-- Because RLS structurally cannot do it. A policy sees ONE row at a time:
-- USING sees the row as it is, WITH CHECK sees the row as it would become.
-- Neither can see BOTH, so no policy can express "content must not change" —
-- that is a statement about a PAIR of rows. (You can fake it by re-reading
-- the old row in a WITH CHECK subquery, but that recurses into this table's
-- own RLS and depends on statement-snapshot subtleties. It is a trick, and
-- this is the audit boundary of the whole feature — not the place for one.)
--
-- Alternatives considered and rejected:
--   • Column-level GRANT UPDATE (deleted_at) — genuinely elegant, and real
--     Postgres. Rejected because Supabase grants `authenticated` table-wide
--     UPDATE by default, so this would mean REVOKEing it, and any later
--     blanket GRANT (dashboard, a default-privileges change, a helpful
--     future migration) silently re-opens every column with nothing to show
--     it happened. A security control that can be undone by an unrelated,
--     plausible action is not a control. It also cannot express direction —
--     no un-delete — so it would need the RLS policy anyway.
--   • CHECK constraint — cannot reference OLD. Same wall as RLS.
-- A BEFORE UPDATE trigger is the only mechanism that sees OLD and NEW
-- together, and it is already this repo's idiom: set_updated_at() is one
-- shared trigger function wired to ~20 tables. This adds a second one in the
-- same shape. No Postgres version is a factor — triggers, RLS and
-- DROP+CREATE TRIGGER (the repo's idiom, used in 0075) work on every version
-- Supabase runs, which is why the deciding argument above is about OLD/NEW
-- visibility rather than version support.
--
-- ─── HOW THE TWO HALVES SPLIT ───────────────────────────────────────────────
--   Trigger → WHICH COLUMNS may ever change. Applies to everyone, always.
--   Policy  → WHO may change them, and in WHICH DIRECTION. `authenticated`
--             only; the service-role bypasses RLS, so moderation keeps its
--             full range (set deleted_at, and clear it to restore).
-- The trigger never looks at deleted_at, which is exactly what keeps
-- service-role restore working while clients are held to one-way deletion.
--
-- Additive + data-safe: one new shared function, one trigger, one new policy.
-- 0080-0082 are untouched, no data is read or rewritten, and nothing that
-- worked before stops working (there was no UPDATE path to break).
-- ════════════════════════════════════════════════════════════════

-- ── 1) Shared guard: declare columns write-once ─────────────────────────────
-- Generic on purpose, and generic in the repo's own established style —
-- set_updated_at() is already one function serving ~20 tables. The immutable
-- column list lives at the trigger site (below), so you can read a table's
-- write-once contract off the CREATE TRIGGER line without opening this
-- function. The community feed of posts that is coming next can reuse it as-is
-- rather than copy-pasting a near-identical guard.
--
-- to_jsonb() rather than named fields is what makes it table-agnostic: a
-- record's fields can't be addressed dynamically in plpgsql, but its jsonb
-- projection can. Equal values always project to equal jsonb, so
-- IS DISTINCT FROM is an exact comparison, and it is NULL-safe by definition.
CREATE OR REPLACE FUNCTION guard_immutable_columns()
  RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  col      text;
  old_json jsonb;
  new_json jsonb;
BEGIN
  -- Shared utilities get attached in ways their author didn't picture. OLD is
  -- NULL on INSERT and on statement-level triggers, which would make every
  -- column below compare NULL-vs-value and reject writes for reasons nobody
  -- could read off the error. Refuse the misattachment by name instead. (This
  -- has to precede the to_jsonb calls, hence assignment here and not in
  -- DECLARE — an unassigned OLD is not reliably a plain NULL to read.)
  IF TG_LEVEL <> 'ROW' OR TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION
      'guard_immutable_columns must be a FOR EACH ROW / BEFORE UPDATE trigger (got % / % on %)',
      TG_LEVEL, TG_OP, TG_TABLE_NAME;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOREACH col IN ARRAY TG_ARGV LOOP
    -- A typo'd column name would otherwise compare NULL to NULL and quietly
    -- guard nothing at all — a guard that silently isn't there is worse than
    -- no guard, so fail loudly on the first UPDATE instead.
    IF NOT jsonb_exists(new_json, col) THEN
      RAISE EXCEPTION
        'guard_immutable_columns: table % has no column % (check the CREATE TRIGGER argument list)',
        TG_TABLE_NAME, col;
    END IF;

    IF old_json -> col IS DISTINCT FROM new_json -> col THEN
      RAISE EXCEPTION
        '%.% is immutable and cannot be changed by an update', TG_TABLE_NAME, col
        USING ERRCODE = 'check_violation';   -- 23514 → PostgREST answers 400, not 500
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

-- ── 2) Freeze the message body ──────────────────────────────────────────────
-- A message is (who, what, when) — all three write-once. Only deleted_at is
-- left mutable, which is the entire point: the row can be retracted, never
-- rewritten. That invariant is what makes a soft-deleted row worth auditing.
--
-- Deliberately NOT exempting the service-role. It gains nothing: moderation
-- sets and clears deleted_at, which this trigger never touches. And it costs
-- the invariant — an exemption is a silent bypass that every future edge
-- function inherits, and it would have to key off JWT claims that are NULL in
-- a plain psql session, so migrations would land on the wrong side of it. If
-- an operator ever genuinely must rewrite stored text (a redaction that has
-- to survive as text, say), that is:
--     ALTER TABLE community_messages DISABLE TRIGGER trg_community_messages_immutable;
--     -- … the deliberate, reviewed fix …
--     ALTER TABLE community_messages ENABLE  TRIGGER trg_community_messages_immutable;
-- Loud, logged, and hard to do by accident — the right amount of friction for
-- rewriting other people's words. Note that ordinary account deletion needs
-- none of this: it CASCADEs and physically removes rows, and DELETE does not
-- fire an UPDATE trigger.
DROP TRIGGER IF EXISTS trg_community_messages_immutable ON community_messages;
CREATE TRIGGER trg_community_messages_immutable
  BEFORE UPDATE ON community_messages
  FOR EACH ROW
  EXECUTE FUNCTION guard_immutable_columns('id', 'user_id', 'content', 'created_at');

-- ── 3) The policy — one legal transition: my live message → deleted ─────────
-- USING and WITH CHECK are doing different jobs, and the pair is what makes
-- deletion one-way:
--   USING      → which rows I may target: mine, and still live. An already
--                deleted row is simply not updatable by me, so there is no
--                un-delete to forbid — the row is out of reach.
--   WITH CHECK → what I may leave behind: mine, and deleted. So I cannot
--                update a live row and have it stay live, which is what an
--                edit would look like.
-- Together: live → deleted, on my own row, and nothing else. The trigger then
-- independently guarantees the rest of the row came through unchanged.
--
-- The user_id clauses look redundant against the trigger (it freezes user_id
-- too) and are kept anyway — each half should be correct on its own, so that
-- disabling the trigger for a one-off can never quietly turn into "anyone can
-- reassign a message to someone else".
--
-- NOT gated on community_access(), unlike SELECT/INSERT. This is the same line
-- 0082 drew for profile writes: community_access() governs seeing OTHERS;
-- owning your own row is unconditional. Retracting your own words must not
-- depend on holding a subscription — the day the room closes to non-payers,
-- their messages are still in it, and "you can no longer delete what you
-- wrote" would be indefensible.
DROP POLICY IF EXISTS community_messages_soft_delete_own ON community_messages;
CREATE POLICY community_messages_soft_delete_own ON community_messages
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid() AND deleted_at IS NOT NULL);

-- deleted_at's exact VALUE is unconstrained (an author could backdate it).
-- Left alone deliberately: every reader only ever asks IS NULL / IS NOT NULL,
-- so a bogus timestamp grants nothing. Forcing it to now() in the trigger
-- would also clobber the service-role's restore-to-NULL.

-- ── Note for the UI sub-task ────────────────────────────────────────────────
-- Delete with NO .select() on the call:
--     await supabase.from('community_messages')
--       .update({ deleted_at: new Date().toISOString() }).eq('id', id)
-- which is already the repo's soft-delete idiom (src/lib/api/clients.js:78).
-- It matters more here than it does there. Asking for the row back makes
-- PostgREST add RETURNING, and RETURNING is filtered by the SELECT policy —
-- which this row has, by design, just stopped satisfying (0081:
-- `deleted_at IS NULL`). The update itself commits fine; the response comes
-- back empty and `.single()` would turn that into a spurious error on a
-- delete that actually worked. Without .select(), supabase-js sends
-- Prefer: return=minimal and there is nothing to filter.
--
-- Realtime is no help here either, for the reason 0081 documents: the updated
-- row no longer passes the SELECT policy, so subscribers are never told. The
-- author's own client should drop the message locally on success; other
-- members see it go on their next refetch.

NOTIFY pgrst, 'reload schema';
