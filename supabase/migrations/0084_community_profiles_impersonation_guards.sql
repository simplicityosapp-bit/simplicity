-- ════════════════════════════════════════════════════════════════
-- Migration 0084 — community_profiles: anti-impersonation
-- Date: 2026-07-17
-- ════════════════════════════════════════════════════════════════
-- 0082 left display_name unscreened and flagged impersonation as the one to
-- settle before anything writes to it. Two locks, for the two halves of
-- "pretending to be us":
--   1. Reserved names  — you cannot CALL yourself Simplicity/support/admin.
--   2. is_verified     — you cannot GIVE YOURSELF the badge that proves it.
-- The badge is the load-bearing one. Names are advisory; a badge the user can
-- set is worse than no badge, because it is believed.
--
-- ─── MECHANISM 1: reserved names → lookup table + RESTRICTIVE policy ────────
-- The alternative was a CHECK constraint with the list inlined. Rejected, and
-- not on style — a CHECK cannot query a table (it must be IMMUTABLE), so the
-- list would live INSIDE the constraint body, and every new name would mean
-- DROP CONSTRAINT + ADD CONSTRAINT: a migration file, a password prompt, and
-- a production DDL statement to block one squatter. This list is guaranteed
-- to grow — the first "Simplicity Support" will arrive the week the room
-- opens — and a guard that is expensive to update is a guard that stops being
-- updated. The table costs one INSERT per name instead (see the bottom).
-- The honest cost of the table: the list is now data, so it is not in the
-- migration history. `SELECT * FROM community_reserved_names` is the record.
--
-- Enforcement is a RESTRICTIVE policy, not a trigger, because a reserved name
-- is a property of the NEW value alone — no OLD needed, which is the wall
-- 0083 hit. That buys the service-role exemption for free: RLS simply does
-- not apply to it, with no role names hardcoded anywhere. And it matters that
-- the founder IS exempt — the official account must be able to be called
-- "Simplicity" and nothing else can name it that. RESTRICTIVE ANDs onto
-- 0082's policies without touching them (the 0075 tier-limit idiom).
--
-- ─── MECHANISM 2: is_verified → column-level GRANT ──────────────────────────
-- 0083 rejected column grants for deleted_at. This is not a reversal; it is
-- the case they fit. That rejection had two legs, and both flip here:
--   • "Grants cannot express direction (no un-delete)." Irrelevant now —
--     is_verified has no legal user-driven direction at all. Never writable
--     is exactly what a grant says.
--   • "The service-role would need an exemption." That was the COST there;
--     here it is the REQUIREMENT. A grant leaves service_role's table-wide
--     privilege untouched, so the founder keeps full freedom without a single
--     role name in a function body.
-- And the obvious RLS answer is a trap worth naming: `WITH CHECK
-- (is_verified = false)` reads correctly and would ship a bug — the moment a
-- user IS verified, every later edit to their own name carries is_verified =
-- true through the check and fails. Verification would silently freeze the
-- profile it was rewarding. A trigger comparing OLD/NEW would work, but only
-- by re-implementing the privilege system in plpgsql against a hardcoded list
-- of role names, to reach the answer the privilege system already gives.
-- The one real cost is carried below, at the GRANT, where it can be checked.
--
-- Additive + data-safe: one new table, three functions, one nullable-safe
-- column with a default, two restrictive policies, and a narrowing of
-- privileges on a table that nothing writes to yet. 0080-0083 untouched.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Normalisation — beat the spacing tricks ──────────────────────────────
-- "Simplicity", "simplicity", "S i m p l i c i t y", "S-i-m-p-l-i-c-i-t-y",
-- "S1mpl1c1ty" and "Simplicity<zero-width-space>" must all collapse to one
-- string before comparison, or the list guards nothing.
--
-- Strips a DENYLIST of separators/invisibles rather than keeping an allowlist
-- of [[:alnum:]] — deliberately, and this is the important line in the file.
-- POSIX classes are ctype-dependent: on a database whose ctype does not
-- classify Hebrew as alphanumeric, `[^[:alnum:]]` would reduce EVERY Hebrew
-- name to the empty string, every pattern to the empty string too, and then
-- '' LIKE '%%' matches — silently blocking every Hebrew display name in a
-- Hebrew-first product. The denylist's failure mode is the survivable one:
-- an exotic character nobody listed slips through and one squatter gets a
-- name. Fail open on a name, never closed on a language.
--
-- search_path = '' per 0045: everything used here is pg_catalog, which is
-- always implicitly searched, so nothing can be resolved out from under it.
CREATE OR REPLACE FUNCTION normalize_display_name(p text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(
           -- lower() first so the leet map only needs one case.
           translate(lower(btrim(coalesce(p, ''))), '013457@$', 'oieastas'),
           -- ASCII/Unicode spacing + punctuation + the invisibles that exist
           -- precisely to defeat string comparison. Hebrew and Latin letters
           -- are none of these, in any ctype.
           --
           -- Written as \uXXXX escapes, NOT as the literal characters. The
           -- literals would be correct and completely unreviewable: a bracket
           -- expression that looks empty, six characters nobody can see in a
           -- diff, and one editor's "strip invisible junk" away from silently
           -- becoming a no-op. Postgres ARE reads \uXXXX natively, and
           -- standard_conforming_strings passes the backslash through intact.
           --   00AD soft hyphen · 200B ZWSP · 200C ZWNJ
           --   200D ZWJ         · 2060 word-joiner · FEFF BOM
           '[[:space:][:punct:]\u00AD\u200B\u200C\u200D\u2060\uFEFF]', '', 'g')
$$;

-- ── 2) The list ─────────────────────────────────────────────────────────────
-- match_mode is what makes this list safe to enforce in a Hebrew coaching
-- product, and it is not decoration. "מנהל" and "תמיכה" are not only
-- impersonation vectors — they are ordinary professional vocabulary here.
-- Blocking any name CONTAINING "מנהל" would reject "מנהל עסקים", a legitimate
-- thing for a business coach to call themselves. So:
--   contains → brand/role words nobody needs inside a real name (simplicity,
--              admin). Catches "Simplicity Support", "SimplicityTeam".
--   exact    → generic words, blocked only when claimed as the WHOLE identity.
--              "תמיכה" is refused; "תמיכה נפשית" is allowed.
CREATE TABLE IF NOT EXISTS community_reserved_names (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern    text NOT NULL,
  match_mode text NOT NULL DEFAULT 'contains',
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_reserved_names_pattern_uniq UNIQUE (pattern),
  CONSTRAINT community_reserved_names_mode_chk CHECK (match_mode IN ('contains', 'exact')),
  -- A pattern that normalises to '' would make `LIKE '%%'` match every name
  -- and lock the whole feature. One row of punctuation must not be able to do
  -- that, so it is rejected at the door.
  CONSTRAINT community_reserved_names_pattern_chk CHECK (normalize_display_name(pattern) <> '')
);

-- Service-role only, the user_integrations way: RLS on, no policies at all.
-- (The rls_auto_enable() event trigger from 0045 would do this anyway; stated
-- explicitly so the table's access story is readable in one place.) Nothing
-- user-facing needs the raw list — the UI validates through the function in
-- §3, which does not reveal it.
ALTER TABLE community_reserved_names ENABLE ROW LEVEL SECURITY;

-- Seeded, not hardcoded. Re-running is a no-op.
INSERT INTO community_reserved_names (pattern, match_mode, note) VALUES
  ('Simplicity',   'contains', 'brand'),
  ('סימפליסיטי',    'contains', 'brand'),
  ('admin',        'contains', 'role — not a word in a real name'),
  ('אדמין',         'contains', 'role — not a word in a real name'),
  ('moderator',    'contains', 'role'),
  ('מודרטור',       'contains', 'role'),
  ('מנהל מערכת',    'contains', 'role — the phrase, unlike bare מנהל, is never innocent'),
  ('תמיכה טכנית',   'contains', 'role — as above'),
  ('מנהל',          'exact',    'generic: "מנהל עסקים" is a legitimate coach title'),
  ('תמיכה',         'exact',    'generic: "תמיכה נפשית" is a legitimate specialty'),
  ('צוות',          'exact',    'generic: "צוות פיתוח" may be legitimate'),
  ('support',      'exact',    'generic: avoids blocking "supportive"'),
  ('team',         'exact',    'generic')
ON CONFLICT (pattern) DO NOTHING;

-- ── 3) The check ────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read the list while the list stays invisible —
-- same shape as current_tier() (0075) and community_access() (0080), and safe
-- for the same reason: it returns one boolean about the string you handed it
-- and discloses nothing else.
--
-- EXECUTE is deliberately NOT revoked, unlike rls_auto_enable() in 0045. An
-- RLS policy expression runs with the querying user's privileges, so revoking
-- EXECUTE from authenticated would not harden this — it would break §4
-- outright. It also lets the UI pre-validate live, which is the good failure
-- mode (a hint under the field, not a 400 after submit):
--     await supabase.rpc('is_reserved_display_name', { p_name: value })
CREATE OR REPLACE FUNCTION is_reserved_display_name(p_name text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM community_reserved_names r
    WHERE CASE r.match_mode
            WHEN 'exact' THEN normalize_display_name(p_name) = normalize_display_name(r.pattern)
            -- Normalisation strips punctuation, so a pattern can never smuggle
            -- a % or _ wildcard into this LIKE.
            ELSE normalize_display_name(p_name) LIKE '%' || normalize_display_name(r.pattern) || '%'
          END
  )
$$;

-- ── 4) Enforce the list ─────────────────────────────────────────────────────
-- RESTRICTIVE → ANDs onto 0082's permissive policies without editing them.
-- USING (true) keeps SELECT/DELETE exactly as they were; only the WITH CHECK
-- side (INSERT + UPDATE) gains the rule.
DROP POLICY IF EXISTS community_profiles_name_not_reserved ON community_profiles;
CREATE POLICY community_profiles_name_not_reserved ON community_profiles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (NOT is_reserved_display_name(display_name));

-- ── 5) The badge ────────────────────────────────────────────────────────────
-- NOT NULL DEFAULT false: existing rows (there are none yet) and every future
-- row start unverified. Verification is granted, never claimed.
ALTER TABLE community_profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- ── 6) Make is_verified unwritable by users ─────────────────────────────────
-- Supabase's default privileges hand `authenticated` table-wide INSERT/UPDATE
-- on every new public table, so the column list has to be narrowed rather than
-- widened. After this, `SET is_verified = true` is refused by the privilege
-- system before RLS is even consulted, on both paths — while service_role,
-- which keeps table-wide privileges, sets it freely.
--
-- This also incidentally freezes id / created_at against user writes, which
-- 0082 never guarded (it only pinned user_id via WITH CHECK). No loss.
--
-- ⚠️  THE COST, stated plainly — this is the one thing to remember about
--     community_profiles: a column added later is NOT user-writable until it
--     is granted here. A future `bio` column will land, look correct, and
--     return "permission denied for table community_profiles" from the app,
--     which reads like an RLS bug and is not one. The fix is one line:
--         GRANT UPDATE (bio) ON community_profiles TO authenticated;
--     Fail-closed is the right default for a table whose entire contents are
--     shown to strangers — new columns should have to be argued INTO public
--     view, not fall in.
--
--     To verify the grants are what this migration intended:
--         SELECT privilege_type, column_name
--           FROM information_schema.column_privileges
--          WHERE table_schema = 'public' AND table_name = 'community_profiles'
--            AND grantee = 'authenticated';
--     Anything with a NULL column_name means a blanket GRANT re-opened the
--     table and the badge is forgeable again.
REVOKE INSERT, UPDATE ON community_profiles FROM authenticated;
GRANT  INSERT (user_id, display_name, avatar_url) ON community_profiles TO authenticated;
GRANT  UPDATE (display_name, avatar_url)          ON community_profiles TO authenticated;

-- Backstop on the likelier forge path. A user creating their profile with
-- is_verified = true is the attack someone actually tries; a grant is what
-- stops it, and this is what stops it if the grant is ever undone. RLS can
-- express this on INSERT because there is no OLD row to preserve — the same
-- reason it CANNOT be done for UPDATE (§ header), so UPDATE has no second
-- line of defence and the grant above is load-bearing there. Cheap, honest,
-- and not a substitute for checking the grants.
DROP POLICY IF EXISTS community_profiles_unverified_insert ON community_profiles;
CREATE POLICY community_profiles_unverified_insert ON community_profiles
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_verified);

-- ── Adding a reserved name later ────────────────────────────────────────────
-- No migration. One INSERT, from the SQL editor or a future admin screen:
--     INSERT INTO community_reserved_names (pattern, match_mode, note)
--     VALUES ('Simplicity Pro', 'contains', 'launched 2026-08');
-- Removing one is a DELETE. Tuning an over-eager entry is one UPDATE:
--     UPDATE community_reserved_names SET match_mode = 'exact' WHERE pattern = 'admin';
-- Both take effect on the next write; nothing is cached and no existing row is
-- re-checked (a name already saved stays saved — renaming squatters is a
-- moderation job, not a constraint's).
--
-- KNOWN GAP: homoglyphs. "Ѕimplicity" with a Cyrillic Ѕ, or Hebrew ו vs Latin
-- l, survives all of this — defeating it needs a Unicode confusables mapping,
-- which is a real project and not a normalise() one-liner. The badge in §5 is
-- the actual answer to that class of attack, which is why it is the half that
-- got the privilege system rather than a word list.

NOTIFY pgrst, 'reload schema';
