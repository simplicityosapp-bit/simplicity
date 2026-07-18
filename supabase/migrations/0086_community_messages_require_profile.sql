-- ════════════════════════════════════════════════════════════════
-- Migration 0086 — community_messages: a profile is required to post
-- Date: 2026-07-17
-- ════════════════════════════════════════════════════════════════
-- One constraint, two results:
--   1. You cannot post without a community_profiles row. Enforced by the
--      database, not by whichever screen remembers to check.
--   2. PostgREST can finally traverse message → author. The 0080-0085 review
--      found both tables reporting `Relationships: []` — they were siblings,
--      each pointing at auth.users, which is not an exposed schema, so there
--      was no path between them and the author's name needed a second round
--      trip. This is the edge that was missing.
--
-- ─── THE DUAL FK IS FINE, AND HERE IS WHY ──────────────────────────────────
-- community_messages.user_id will carry TWO foreign keys:
--   → auth.users(id)             — 0080, inline and unnamed, so Postgres
--                                  called it community_messages_user_id_fkey
--   → community_profiles(user_id) — this migration
-- Postgres has no objection to several FKs on one column; each just needs its
-- own unique target. auth.users(id) is a primary key, and
-- community_profiles.user_id carries `community_profiles_user_uniq UNIQUE`
-- from 0082 — checked before writing this, and the ADD below would refuse
-- outright ("no unique constraint matching given keys") if that were wrong.
-- The names do not collide: the 0080 one is *_user_id_fkey, this one is not.
--
-- PostgREST cannot be confused by the pair either: this project exposes only
-- `public` and `graphql_public` (verified against the live schema), so the
-- auth.users edge is invisible to it and exactly one relationship is visible
-- from community_messages. The embed therefore needs no disambiguation —
-- plain `community_profiles(...)` resolves.
--
-- The auth.users FK is now redundant for integrity (a message's user_id must
-- match a profile, whose user_id must match an auth user). It is deliberately
-- LEFT ALONE: it is 0080's object, dropping it is not additive, and a second
-- cascade path to the same rows costs nothing.
--
-- Additive + data-safe: one constraint. No column, table, policy, function or
-- row is dropped or rewritten. 0080-0085 untouched.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Pre-flight: prove the premise instead of trusting it ─────────────────
-- The brief says both tables are empty and no app code writes them (the repo
-- confirms the second half — nothing outside supabase/migrations references
-- either table). But this session has no database credential, so the row
-- counts are taken on trust, and this migration will also be run against
-- other environments and restored backups where that trust does not hold.
--
-- So it checks for itself. Without this, a stray message with no profile
-- would fail the ADD below with Postgres naming ONE offending key and no
-- sense of scale. This says how many, up front, and refuses cleanly.
DO $$
DECLARE
  orphans bigint;
BEGIN
  SELECT count(*) INTO orphans
  FROM community_messages m
  WHERE NOT EXISTS (
    SELECT 1 FROM community_profiles p WHERE p.user_id = m.user_id
  );

  IF orphans > 0 THEN
    RAISE EXCEPTION
      '0086 pre-flight: % community_messages row(s) have no community_profiles row. '
      'Back-fill a profile for each author (or remove the messages) before adding '
      'the FK — this migration will not orphan or delete anything on its own.',
      orphans;
  END IF;

  RAISE NOTICE '0086 pre-flight: no orphaned messages — safe to add the FK.';
END $$;

-- ── 2) The constraint ───────────────────────────────────────────────────────
-- NAMED FOR THE ERROR, not for the convention. The repo's FKs are mostly
-- <table>_<column>_fkey, and that name is taken here anyway by 0080's inline
-- reference. More to the point, this constraint's failure is a normal, expected
-- application state — "you haven't made a profile yet" — not a bug, so its name
-- is user-facing plumbing. It reads in the raw error as:
--
--   insert or update on table "community_messages" violates foreign key
--   constraint "community_messages_requires_profile"
--
-- which says what went wrong even with no other context to hand.
--
-- ON DELETE CASCADE, matching both existing FKs. It is also what makes account
-- deletion stay simple: deleting an auth user cascades to the profile, and the
-- profile cascades to the messages — the same rows 0080's own cascade removes,
-- reached by two paths, which Postgres is happy to do. The alternative (NO
-- ACTION) would leave account deletion depending on which of the two cascades
-- Postgres happens to fire first. Not a thing to rest a delete flow on.
--
-- ⚠️  THE ONE CONSEQUENCE WORTH KNOWING: deleting a community_profiles row now
--     HARD-deletes that author's whole message history, silently. That is no
--     change for account deletion (0080's cascade already did exactly that),
--     and 0082 gives users no DELETE policy on profiles, so only the
--     service-role can trigger it. But it is a trap for a future moderator
--     reaching for "remove this person's profile" and not expecting 0081/0083's
--     carefully auditable soft-deleted messages to vanish with it. Moderation
--     stays what it always was: set deleted_at. Do not delete the profile.
--
-- Guarded rather than DROP+ADD (the repo's idiom for CHECK constraints): a
-- re-run should not re-validate an already-valid FK.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_messages_requires_profile'
      AND conrelid = 'public.community_messages'::regclass
  ) THEN
    RAISE NOTICE 'community_messages_requires_profile already exists — nothing to do.';
  ELSE
    ALTER TABLE community_messages
      ADD CONSTRAINT community_messages_requires_profile
      FOREIGN KEY (user_id) REFERENCES community_profiles (user_id)
      ON DELETE CASCADE;
    RAISE NOTICE 'community_messages_requires_profile added.';
  END IF;
END $$;

-- No new index. The FK's referencing side is already covered by
-- idx_community_messages_user (0080), which is what keeps the cascade and the
-- embed's lookup cheap; the referenced side rides community_profiles_user_uniq.

-- ── Notes for the UI sub-task ───────────────────────────────────────────────
-- THE EMBED — now a single request, no client-side join:
--     supabase.from('community_messages')
--       .select('*, community_profiles(display_name, avatar_url, is_verified)')
--       .order('created_at', { ascending: false })
--
--   `community_profiles` comes back as an OBJECT, not an array: user_id is not
--   unique on community_messages, so the relationship is many-messages-to-one-
--   profile and PostgREST embeds it to-one. No `!inner` and no
--   `!community_messages_requires_profile` disambiguation is needed — there is
--   only one visible relationship (see the header).
--
--   No filter on deleted_at is needed either: 0081 enforces `deleted_at IS
--   NULL` in the SELECT policy itself, so soft-deleted rows never arrive.
--   The embedded profile passes through community_profiles' own RLS, which is
--   open to any member today and closes in lockstep with the room if
--   community_access() ever tightens.
--
-- THE ERROR — posting with no profile is now a clean, catchable failure.
--   Postgres raises SQLSTATE 23503 (foreign_key_violation); PostgREST returns
--   HTTP 409 with the constraint name in `message`:
--     if (error?.code === '23503' &&
--         error.message.includes('community_messages_requires_profile')) {
--       // route to "create your profile first", not a raw DB error
--     }
--   Worth distinguishing from the room's other refusals so the UI can say the
--   right thing: 23503 here = no profile · 23514 = a guard trigger (reserved
--   name, or an immutable column from 0083) · 42501 = a column the client may
--   not write (0084/0085 grants) · empty result on write = RLS.
--
-- ORDER OF WRITES: the profile row must be committed before the first message.
--   A single PostgREST request cannot do both, so the profile screen has to
--   land first — which is the decision this migration is enforcing.

NOTIFY pgrst, 'reload schema';
