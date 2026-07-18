-- ════════════════════════════════════════════════════════════════
-- Migration 0080 — community_messages: global community chat (MVP)
-- Date: 2026-07-17
-- ════════════════════════════════════════════════════════════════
-- ONE global room, text-only, append-only. No sub-groups, no threads, no
-- attachments — a message is just (who, what, when).
--
-- ⚠️  THE ROOM IS DELIBERATELY OPEN TO EVERY SIGNED-IN USER.
--     The intended rule is "must hold an active community subscription",
--     but that product doesn't exist yet: billing is still dormant
--     (BILLING_ENABLED=false + billing_enforced()=false — see 0075), and
--     "community" exists today only as a PREMIUM benefit label in the plan
--     copy (TIER_BENEFITS in SubscriptionBody.jsx → subscription.community
--     = "פגישות קהילה דו-שבועיות"). There is no community-subscription
--     column, table, or flag anywhere in the schema.
--
--     So access is funnelled through ONE function — community_access().
--     Both policies below call it and nothing else, which makes closing the
--     room later a one-line CREATE OR REPLACE of that function body: no
--     policy rewrite, no table change, no re-grant. This mirrors the
--     billing_enforced() master-switch pattern established in 0075.
--
-- Additive + data-safe: one new table + one new function. No existing
-- column, table, policy, or function is altered or dropped. Re-running is a
-- no-op (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS guards).
-- ════════════════════════════════════════════════════════════════

-- ── 1) The access lever — currently WIDE OPEN ───────────────────────────────
-- Returns true for any authenticated caller. This is the single condition
-- that the whole room hangs off.
--
-- Declared SECURITY DEFINER / STABLE / search_path=public even though the
-- body reads no table TODAY — that is on purpose. It is exactly how
-- current_tier() is declared in 0075, so the future gate is a pure BODY
-- swap; nothing about the signature, volatility, or policies has to move.
-- Safe as DEFINER for the same reason current_tier() is: it takes NO
-- argument and derives the user from auth.uid() (which still reads the
-- request JWT under DEFINER), so it can't be abused via RPC to probe
-- another user's access.
--
--   TO GATE ON THE COMMUNITY SUBSCRIPTION LATER — the entire change:
--     CREATE OR REPLACE FUNCTION community_access()
--       RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
--       SET search_path = public AS $$
--       SELECT NOT billing_enforced() OR current_tier() = 'premium'
--     $$;
--
--   That reuses 0075 wholesale: the NOT billing_enforced() branch keeps the
--   room open until the master switch flips (so this can ship BEFORE Stripe
--   without trapping anyone), and current_tier() already resolves an active
--   beta exemption to 'premium' — beta users keep the community for free,
--   automatically. If "community" later becomes its own add-on rather than a
--   premium perk, only this body changes.
CREATE OR REPLACE FUNCTION community_access()
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
$$;

-- ── 2) Table ────────────────────────────────────────────────────────────────
-- Shape follows `feedback` (0004), the closest existing analog: uuid PK,
-- user_id defaulted from auth.uid() + FK to auth.users, non-empty text guard,
-- timestamptz created_at.
--
-- ON DELETE CASCADE matches every other user-owned table in the schema: a
-- user who deletes their account takes their messages out of the room with
-- them. Worth a product look before the room has real history in it — the
-- alternative (keep the message, orphan the author) needs a nullable user_id
-- and a "deleted user" rendering, and is a much bigger change AFTER the fact.
CREATE TABLE IF NOT EXISTS community_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid()
               REFERENCES auth.users(id) ON DELETE CASCADE,
  content    text NOT NULL CHECK (char_length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The room reads newest-first; the user index serves the FK/cascade and any
-- "my messages" lookup.
CREATE INDEX IF NOT EXISTS idx_community_messages_created_at ON community_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_messages_user       ON community_messages (user_id);

-- ── 3) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;

-- Read the room. Every signed-in user passes today, because
-- community_access() is open — this policy never needs to change when that
-- stops being true.
DROP POLICY IF EXISTS community_messages_select_members ON community_messages;
CREATE POLICY community_messages_select_members ON community_messages
  FOR SELECT TO authenticated USING (community_access());

-- Post to the room. TWO distinct conditions, deliberately not merged:
--   user_id = auth.uid()  → IDENTITY. You may only post AS yourself. This is
--                           permanent and has nothing to do with billing.
--   community_access()    → MEMBERSHIP. The swappable half.
DROP POLICY IF EXISTS community_messages_insert_members ON community_messages;
CREATE POLICY community_messages_insert_members ON community_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND community_access());

-- No UPDATE and no DELETE policy for `authenticated`, on purpose: the room is
-- append-only — nobody can rewrite or unsend history, not even their own
-- (same shape as app_sessions in 0076). Moderation, when it's needed, goes
-- through a service-role edge function, which bypasses RLS.

-- Make the new table visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
