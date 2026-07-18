-- ════════════════════════════════════════════════════════════════
-- Migration 0082 — community_profiles: minimal public identity
-- Date: 2026-07-17
-- ════════════════════════════════════════════════════════════════
-- Answers ONE question: "who sent this message?"
--
-- Today nothing can answer it. `auth.users` is not readable by
-- `authenticated`, and user_preferences (where profile.* lives) is
-- select-own — `user_preferences_own ... USING (user_id = auth.uid())`. So a
-- user can read the room but cannot resolve a single author's name. This
-- table is the deliberate, minimal opt-in surface that crosses that line:
-- the ONLY user data in the schema readable by someone other than its owner.
-- Everything in it is therefore public-within-the-community BY DEFINITION —
-- that is the point, and it is also the reason to keep it small.
--
-- SCOPE: schema only. No UI, no form, no onboarding, no backfill — no
-- existing user gets a row from this migration. Rows appear only when
-- something writes them (a later sub-task). Until then the room simply has
-- no names to show; see the note at the bottom for what that means.
--
-- Additive + data-safe: one new table. Nothing existing is altered or
-- dropped; 0080 and 0081 are untouched. Re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Table ────────────────────────────────────────────────────────────────
-- id PK + UNIQUE(user_id) follows user_subscriptions (0075) and
-- user_preferences: a surrogate key for things to point AT, plus a hard
-- one-row-per-user guarantee.
--
-- BUILT TO GROW — the future sub-tasks (professional identity, level/XP,
-- public goals/projects) need nothing from this shape that isn't already
-- here:
--   • More profile fields → ALTER TABLE ADD COLUMN, nullable. Additive, and
--     they inherit the read policy below for free.
--   • Linked tables (xp_events, community_goals, …) → FK to `id` (stable,
--     never changes) or to `user_id` (UNIQUE, so it is a legal FK target
--     too). Both doors are open; neither needs this table to change.
--   • Anything with its own lifecycle, volume, or access rule (XP ledgers,
--     published goals) SHOULD be its own table, not a column here. Keeping
--     this table narrow is what keeps "public" easy to reason about — every
--     column added here is a column shown to strangers.
-- No speculative columns and no jsonb catch-all: an untyped bag would dodge
-- exactly the review that a public surface most needs.
--
-- user_id mirrors community_messages.user_id exactly — same reference, same
-- CASCADE — so a deleted account drops its profile and its messages together.
CREATE TABLE IF NOT EXISTS community_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid()
                 REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Required: a row exists only to give the author a name. The non-empty
  -- guard is the repo's standard text check (feedback.message,
  -- user_quotes.text, community_messages.content).
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) > 0),
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_profiles_user_uniq UNIQUE (user_id)
);

-- No idx_..._user index: the UNIQUE constraint above already builds one on
-- user_id, which serves both the author lookup and the FK/cascade.

-- ── 2) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;

-- READ — the whole point of the table. community_access() is the right gate
-- and it fits: when the room closes to non-subscribers, the directory of who
-- is IN the room must close with it, through the same one-line swap in 0080.
-- Reusing it means the two can never drift apart.
--
-- `OR user_id = auth.uid()` is NOT a product choice — it is a correctness
-- requirement. PostgREST returns the affected row on write by default
-- (Prefer: return=representation), and .insert().select() / .update().select()
-- both need SELECT to pass. Without this clause, the day community_access()
-- starts returning false, a non-subscriber's write to their OWN profile would
-- succeed but come back empty — a bug that would only appear at the moment
-- billing is switched on, in the hardest place to debug it. You can always
-- read your own row; the gate only ever governs seeing OTHER people.
DROP POLICY IF EXISTS community_profiles_select_members ON community_profiles;
CREATE POLICY community_profiles_select_members ON community_profiles
  FOR SELECT TO authenticated
  USING (community_access() OR user_id = auth.uid());

-- WRITE — identity only, deliberately NOT gated on community_access().
-- The line this draws: community_access() governs seeing OTHERS; owning your
-- own row is unconditional, like user_preferences. Gating writes would mean a
-- user must subscribe before they can pick a name — backwards, and it would
-- break the natural order of any future onboarding (fill in profile → join).
DROP POLICY IF EXISTS community_profiles_insert_own ON community_profiles;
CREATE POLICY community_profiles_insert_own ON community_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE needs BOTH clauses, and they do different jobs: USING picks which
-- rows you may touch (only yours), WITH CHECK constrains what you may leave
-- behind (still yours). Without WITH CHECK, a user could reassign user_id and
-- hand their profile to someone else.
DROP POLICY IF EXISTS community_profiles_update_own ON community_profiles;
CREATE POLICY community_profiles_update_own ON community_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy for `authenticated`: deleting your profile while your
-- messages stay in the room would strip the author name off live history.
-- Account deletion is already handled — the CASCADE above removes the
-- profile and the messages together. Leaving the community is a product
-- flow that does not exist yet, and it is more than one DELETE.

-- ── Notes for whoever fills this in ─────────────────────────────────────────
-- • No row = no name. Every user, including existing ones, starts with no
--   profile, so the room's author join MUST be a LEFT JOIN with a fallback —
--   it can never assume a profile exists. There is no backfill here because
--   display_name is a CHOICE (real name? nickname? business name?), and
--   inventing one from user_preferences for every existing user is exactly
--   the kind of decision that belongs to the owner, not a migration.
-- • display_name is NOT unique, has no length cap, and is not screened. All
--   three are open product questions on a field strangers will read:
--   impersonation ("Simplicity Support"), overlong names, and abuse. Worth
--   settling BEFORE the writing sub-task, not after.
-- • resetAllUserData() (src/lib/api/account.js) will not clear this table or
--   community_messages. That looks correct and matches how `feedback` is
--   already treated there — community content is shared, not private app
--   data a reset should silently rewrite — but it is a conscious call to
--   confirm, not an oversight to inherit.

NOTIFY pgrst, 'reload schema';
