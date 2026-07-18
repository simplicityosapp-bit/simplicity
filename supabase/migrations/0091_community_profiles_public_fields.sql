-- ════════════════════════════════════════════════════════════════
-- Migration 0091 — community_profiles: public professional identity
-- Date: 2026-07-18
-- ════════════════════════════════════════════════════════════════
-- 0082 built community_profiles "to grow": more fields → ALTER TABLE ADD
-- COLUMN, nullable, and they inherit the SELECT policy for free. This is that
-- growth — the four fields a member's public card shows beyond name + avatar:
--   • bio         — a short "who I am" paragraph
--   • headline    — a one-line role / field ("מאמנת אישית · NLP")
--   • specialties — a few short tags, filterable later
--   • link        — one external URL (site / landing / social)
--
-- All nullable, all optional: an empty field is simply not shown. Nothing is
-- backfilled — existing profiles keep name + avatar until their owner edits.
--
-- VISIBILITY: unchanged. These columns live on community_profiles, so they are
-- governed by its existing row policy (0082) — readable by community members,
-- and always by the owner. "Fully public, outside the app" is a deliberately
-- later stage and would need its own policy; this migration does NOT open that.
--
-- WRITABILITY: this is the trap 0084 flagged in writing. 0084/0085 revoked the
-- table-wide INSERT/UPDATE grants and re-granted specific columns only, so a
-- new column is NOT user-writable until it is granted here by name — it would
-- otherwise land, look correct, and silently refuse every save. The grants at
-- the bottom are that argument-into-public, made explicitly per column.
--
-- Additive + data-safe: only ADD COLUMN + CHECK + GRANT. Nothing is dropped or
-- rewritten; is_verified's guards (0084/0085) are untouched. Re-running is a
-- no-op (IF NOT EXISTS columns; DROP-then-ADD constraints; additive grants).
-- ════════════════════════════════════════════════════════════════

-- ── 1) The four columns ─────────────────────────────────────────────────────
ALTER TABLE community_profiles ADD COLUMN IF NOT EXISTS bio         text;
ALTER TABLE community_profiles ADD COLUMN IF NOT EXISTS headline    text;
ALTER TABLE community_profiles ADD COLUMN IF NOT EXISTS specialties text[];
ALTER TABLE community_profiles ADD COLUMN IF NOT EXISTS link        text;

-- ── 2) Bounds (DROP-then-ADD so re-running is clean; PG has no ADD CONSTRAINT
--        IF NOT EXISTS). All NULL-guarded, so existing rows validate instantly.
ALTER TABLE community_profiles DROP CONSTRAINT IF EXISTS community_profiles_bio_len;
ALTER TABLE community_profiles ADD  CONSTRAINT community_profiles_bio_len
  CHECK (bio IS NULL OR char_length(bio) <= 300);

ALTER TABLE community_profiles DROP CONSTRAINT IF EXISTS community_profiles_headline_len;
ALTER TABLE community_profiles ADD  CONSTRAINT community_profiles_headline_len
  CHECK (headline IS NULL OR char_length(headline) <= 80);

-- Specialties: at most 8 tags, and ≤200 chars total across them (array_to_string
-- keeps this a scalar expression — a CHECK cannot hold a subquery, so per-tag
-- length is capped client-side; total length bounds the abuse that matters).
ALTER TABLE community_profiles DROP CONSTRAINT IF EXISTS community_profiles_specialties_bounds;
ALTER TABLE community_profiles ADD  CONSTRAINT community_profiles_specialties_bounds
  CHECK (
    specialties IS NULL OR (
      coalesce(array_length(specialties, 1), 0) <= 8
      AND char_length(array_to_string(specialties, ',')) <= 200
    )
  );

-- Link: http/https only — same stance as the message linkifier, so a stored
-- profile link can never be a javascript:/data: URI when it's later rendered.
ALTER TABLE community_profiles DROP CONSTRAINT IF EXISTS community_profiles_link_shape;
ALTER TABLE community_profiles ADD  CONSTRAINT community_profiles_link_shape
  CHECK (link IS NULL OR (char_length(link) <= 200 AND link ~* '^https?://'));

-- ── 3) Make the four columns user-writable ──────────────────────────────────
-- ADD to the existing per-column grants (INSERT on user_id/display_name/
-- avatar_url from 0084, UPDATE on display_name/avatar_url). GRANT is additive
-- per column, so display_name/avatar_url are unaffected and is_verified stays
-- ungranted (still refused). A member sets these on first insert AND on later
-- edits, so both privileges are needed.
GRANT INSERT (bio, headline, specialties, link) ON community_profiles TO authenticated;
GRANT UPDATE (bio, headline, specialties, link) ON community_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
