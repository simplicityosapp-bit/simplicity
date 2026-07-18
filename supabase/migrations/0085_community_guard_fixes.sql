-- ════════════════════════════════════════════════════════════════
-- Migration 0085 — community: three fixes from the 0080-0084 review
-- Date: 2026-07-17
-- ════════════════════════════════════════════════════════════════
--   A. community_messages: stop clients choosing created_at / deleted_at.
--   B. community_profiles: stop the reserved-name check firing on updates
--      that do not touch display_name.
--   C. normalize_display_name: close the '1' → i-or-l leet ambiguity.
--
-- Additive + data-safe. Two grants narrowed, one policy narrowed in scope,
-- one function body replaced, one trigger added. No column, table, or row is
-- dropped or rewritten, and no stored data changes meaning — the reserved
-- list's `pattern` values are untouched; only how they are compared changes.
-- Nothing in the repo reads these tables yet, so no client breaks.
-- ════════════════════════════════════════════════════════════════

-- ── A) A message's timestamp is the server's fact, not the client's ─────────
-- 0083 freezes created_at against UPDATE, which makes the room read as though
-- its ordering were trustworthy. It is not: INSERT was never constrained. The
-- only checks were 0080's `user_id = auth.uid() AND community_access()`, and
-- Supabase's default grants leave `authenticated` table-wide INSERT — so a
-- client can post with created_at = 2099 and pin itself to the top of a
-- created_at DESC feed forever, or interleave messages into last month's
-- history. That is not a stray edge case in a chat room; it is the ordering
-- the whole feature is read through.
--
-- Same lever as 0084 used for is_verified, for the same reasons: it is the
-- privilege system's own answer to "this role may not write this column", it
-- needs no OLD row, and it leaves service_role's table-wide grant intact —
-- which is wanted here, since importing or seeding real history legitimately
-- needs to set created_at.
--
-- `id` is also left out of the grant: clients have no reason to choose a
-- message's primary key, and SERVER_OWNED in src/lib/api/clients.js already
-- treats id/created_at/deleted_at as the server's to set.
--
-- ⚠️  Same fail-closed cost 0084 carries, now on this table too: a column
--     added to community_messages later is NOT insertable by clients until
--     it is granted here. A future `reply_to_id` will land, look right, and
--     return "permission denied for table community_messages". One line:
--         GRANT INSERT (reply_to_id) ON community_messages TO authenticated;
REVOKE INSERT ON community_messages FROM authenticated;
GRANT  INSERT (content, user_id) ON community_messages TO authenticated;

-- Backstop for the deleted_at half, mirroring 0084's unverified_insert. A
-- pre-deleted message is not dangerous — it is invisible on arrival — but it
-- is a way to write rows nobody can see, and RLS can express this one because
-- it is a property of the new row alone. created_at gets NO such backstop:
-- "was this timestamp chosen by the client?" is not a question the row can
-- answer, so the grant above is load-bearing there and is the thing to check
-- if this ever regresses.
DROP POLICY IF EXISTS community_messages_insert_live ON community_messages;
CREATE POLICY community_messages_insert_live ON community_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (deleted_at IS NULL);

-- ── B) Check the name only when the name changes ────────────────────────────
-- 0084 put the reserved-name rule in a RESTRICTIVE FOR ALL policy, whose
-- WITH CHECK evaluates the whole resulting row on every INSERT *and* UPDATE.
-- So changing an avatar re-validates a display_name that is not being
-- touched, and the day a name is added to the blocklist, every existing user
-- holding it is locked out of unrelated profile edits by an RLS error that
-- mentions nothing about names. 0084's own note ("a name already saved stays
-- saved") is true of the stored row and wrong about the consequence.
--
-- ─── MECHANISM: split by command. Policy for INSERT, trigger for UPDATE. ───
-- "Only check when it changed" is a statement about OLD vs NEW, and a policy
-- can never see both — the same wall 0083 hit. But swapping the whole rule to
-- a trigger would break the property 0084 was built around: RLS does not
-- apply to service_role, which is exactly how the founder can name the
-- official account "Simplicity" while nobody else can. A trigger applies to
-- everyone. So neither mechanism alone is right, and the two commands do not
-- have the same problem:
--   INSERT → there is no OLD. Every insert must be checked, unconditionally.
--            A policy says that perfectly, and keeps the free exemption.
--   UPDATE → needs OLD. Trigger, gated on the column actually changing.
-- Below, the FOR ALL policy is narrowed to FOR INSERT (its USING (true) was
-- always a no-op on SELECT/DELETE, and its WITH CHECK on UPDATE is what this
-- migration is removing) and the UPDATE half becomes a trigger.
DROP POLICY IF EXISTS community_profiles_name_not_reserved ON community_profiles;
CREATE POLICY community_profiles_name_not_reserved ON community_profiles
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_reserved_display_name(display_name));

-- The UPDATE half. Note this trigger DOES exempt the service-role, where
-- 0083's guard_immutable_columns deliberately does not — the two rules are
-- different in kind, not treated inconsistently. "Nobody rewrites history" is
-- an absolute the service-role gains nothing by escaping. "You may not call
-- yourself Simplicity" is aimed at users BY DESIGN: 0084 exists so the
-- founder can hold those names. An absolute trigger would forbid the one
-- account the list is protecting.
--
-- The exemption tests `auth.uid() IS NULL` — "no end user is acting" — rather
-- than naming roles. That is true for service_role (its JWT carries no `sub`)
-- and for a plain psql/migration session, which are precisely the two callers
-- that should pass. It cannot be abused from the other side: an authenticated
-- request always carries a sub, and a request without one fails 0082's
-- `user_id = auth.uid()` UPDATE policy anyway, so there is no row to reach.
-- This is not the JWT-sniffing 0083 rejected — that objection was that
-- migrations would land on the WRONG side of such a test. Here they land on
-- the right one.
CREATE OR REPLACE FUNCTION community_profiles_guard_reserved_name()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service-role / migration: same standing RLS would give it
  END IF;

  IF is_reserved_display_name(NEW.display_name) THEN
    RAISE EXCEPTION 'display_name "%" is reserved and cannot be used', NEW.display_name
      USING ERRCODE = 'check_violation';   -- 23514 → PostgREST answers 400
  END IF;

  RETURN NEW;
END $$;

-- The WHEN clause IS the fix, and it is deliberately here rather than inside
-- the function: an avatar-only update never calls the function at all, and a
-- reader can see that from the trigger definition without opening anything.
DROP TRIGGER IF EXISTS trg_community_profiles_reserved_name ON community_profiles;
CREATE TRIGGER trg_community_profiles_reserved_name
  BEFORE UPDATE ON community_profiles
  FOR EACH ROW
  WHEN (NEW.display_name IS DISTINCT FROM OLD.display_name)
  EXECUTE FUNCTION community_profiles_guard_reserved_name();

-- Net effect, all four paths:
--   INSERT reserved            → policy blocks
--   UPDATE name → reserved     → trigger blocks
--   UPDATE avatar only         → trigger never fires, succeeds even if the
--                                stored name has since become reserved
--   service_role, any of these → passes (RLS bypass / auth.uid() IS NULL)
-- A user already holding a newly-reserved name keeps their row and can still
-- edit everything else; they are only stopped from re-asserting the name.

-- ── C) '1' is both i and l — so fold the whole class ────────────────────────
-- The old map sent '1' → 'i', which caught "S1mpl1c1ty" and missed
-- "Simp1icity" (1 standing in for the L). Picking the other mapping just
-- moves the hole, and testing both variants misses mixed cases like
-- "S1mp1icity" — n ambiguous characters need 2^n variants.
--
-- Instead: collapse the confusable class {i, l, 1} onto ONE canonical
-- character, on BOTH sides of the comparison. The pattern normalises through
-- the same function as the name, so "simplicity" and every i/l/1 permutation
-- of it become the same string ("simpiicity") and compare equal — all
-- combinations, in one pass, no variants. That is why this is a one-character
-- change to the map rather than new machinery.
--
-- Only '1' was ambiguous; the other mappings (0→o, 5→s, @→a …) each have one
-- sensible reading and are unchanged.
--
-- FALSE POSITIVES — the reason to be careful, checked against the live list:
-- folding l→i makes the comparison blunter, so a real name could in principle
-- collapse onto a blocked pattern. Against what is actually seeded it does
-- not: "moderator", "support", "team" contain no i/l/1 and are unchanged;
-- "admin" folds to itself, so only admin/admln/adm1n match — all of which are
-- the point; "simplicity" needs a name shaped like simplicity to collide; and
-- every Hebrew pattern is untouched, since this folds Latin only. The risk to
-- watch is a FUTURE short Latin pattern rich in i/l — "lily" would fold to
-- "iiiy" and start catching innocent names. Prefer match_mode = 'exact' for
-- anything like that.
--
-- Normalised forms are now less readable ("simpiicity"): that is expected,
-- and it is why the raw `pattern` column is what the list stores and shows.
CREATE OR REPLACE FUNCTION normalize_display_name(p text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(
           -- 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s  … plus l→i, which is not a leet
           -- mapping but a CONFUSABLE FOLD: i, l and 1 all land on 'i' so that
           -- name and pattern collapse together regardless of which the writer
           -- reached for.
           translate(lower(btrim(coalesce(p, ''))), '013457@$l', 'oieastasi'),
           -- Unchanged from 0084. \uXXXX escapes, never the literal characters:
           --   00AD soft hyphen · 200B ZWSP · 200C ZWNJ
           --   200D ZWJ         · 2060 word-joiner · FEFF BOM
           '[[:space:][:punct:]\u00AD\u200B\u200C\u200D\u2060\uFEFF]', '', 'g')
$$;

-- The CHECK on community_reserved_names.pattern calls this function, and
-- Postgres does NOT re-validate existing rows when a function body is
-- replaced. That is fine and worth stating: every seeded pattern still
-- normalises non-empty under the new map (folding only substitutes
-- characters, it never removes them), so no stored row is left violating its
-- own constraint.

NOTIFY pgrst, 'reload schema';
