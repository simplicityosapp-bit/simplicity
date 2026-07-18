-- ════════════════════════════════════════════════════════════════
-- Migration 0093 — community: security-review hardening
-- Date: 2026-07-18
-- ════════════════════════════════════════════════════════════════
-- Four hardening fixes surfaced by an adversarial review. All additive /
-- data-safe (policy + grant + constraint swaps, function bodies unchanged in
-- behaviour); re-running is a no-op.
--
--   1) Reactions & mentions of a SOFT-DELETED message stayed world-readable.
--      0081 hides a deleted message from the feed, but its reaction rows
--      (reactor identities) and mention rows (who was @-tagged) were gated on
--      community_access() alone — so a member could still query them straight
--      off PostgREST, partly defeating moderation. Gate both on the parent
--      message being live, exactly as 0081 does for the message itself.
--   2) Two SECURITY DEFINER functions used `search_path = public` with
--      unqualified table refs — the temp-table-shadowing footgun 0045 closed
--      everywhere else. Pin `search_path = ''` + schema-qualify. Bodies are
--      otherwise identical to 0084 / 0089.
--   3) community_notifications kept table-wide UPDATE, so a recipient could
--      rewrite type/actor_id/… on their own notices. Narrow it to read_at,
--      matching the per-column grant discipline of every other write table.
--   4) display_name — shown next to every message — had no length bound (0091
--      capped every other public field). Add a 60-char cap (the client already
--      enforces 60; this closes a direct-PostgREST write).
-- ════════════════════════════════════════════════════════════════

-- ── 1) Hide reactions/mentions of soft-deleted messages ─────────────────────
DROP POLICY IF EXISTS community_reactions_select_members ON community_message_reactions;
CREATE POLICY community_reactions_select_members ON community_message_reactions
  FOR SELECT TO authenticated
  USING (
    community_access()
    AND EXISTS (SELECT 1 FROM community_messages m
                WHERE m.id = message_id AND m.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS community_mentions_select_members ON community_message_mentions;
CREATE POLICY community_mentions_select_members ON community_message_mentions
  FOR SELECT TO authenticated
  USING (
    community_access()
    AND EXISTS (SELECT 1 FROM community_messages m
                WHERE m.id = message_id AND m.deleted_at IS NULL)
  );

-- ── 2) Pin search_path + schema-qualify the two DEFINER functions ───────────
-- Same bodies as 0084 / 0089, only search_path='' and public.-qualified refs.
CREATE OR REPLACE FUNCTION is_reserved_display_name(p_name text)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_reserved_names r
    WHERE CASE r.match_mode
            WHEN 'exact' THEN public.normalize_display_name(p_name) = public.normalize_display_name(r.pattern)
            ELSE public.normalize_display_name(p_name) LIKE '%' || public.normalize_display_name(r.pattern) || '%'
          END
  )
$$;

CREATE OR REPLACE FUNCTION community_notify_on_mention()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  author_id uuid;
BEGIN
  SELECT user_id INTO author_id FROM public.community_messages WHERE id = NEW.message_id;
  IF NEW.mentioned_user_id IS DISTINCT FROM author_id THEN
    INSERT INTO public.community_notifications (recipient_id, actor_id, type, message_id)
    VALUES (NEW.mentioned_user_id, author_id, 'mention', NEW.message_id);
  END IF;
  RETURN NEW;
END $$;

-- ── 3) Narrow community_notifications UPDATE to read_at ──────────────────────
REVOKE UPDATE ON community_notifications FROM authenticated;
GRANT  UPDATE (read_at) ON community_notifications TO authenticated;

-- ── 4) Cap display_name length ──────────────────────────────────────────────
ALTER TABLE community_profiles DROP CONSTRAINT IF EXISTS community_profiles_display_name_len;
ALTER TABLE community_profiles ADD  CONSTRAINT community_profiles_display_name_len
  CHECK (char_length(display_name) <= 60);

NOTIFY pgrst, 'reload schema';
