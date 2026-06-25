-- ════════════════════════════════════════════════════════════════
-- Migration 0069 — Corrective: carry the lead-page booking CTA into the engine
-- Date: 2026-06-25
-- ════════════════════════════════════════════════════════════════
-- Migration 0068 folded lead_pages into site_pages but did NOT carry the
-- optional booking CTA (lead_pages.content.bookingPageRef → a button to the
-- coach's /book/<ref> page). This appends that CTA as a `cta` section to the
-- migrated lead pages that had one, restoring full fidelity.
--
-- The cta block's `link` action is validated as http(s) by the renderer, so a
-- bare "/book/<ref>" would be rejected — we store the ABSOLUTE production URL.
-- The /book/<ref> target is still served by the legacy booking system (booking
-- pages move to the engine in phase 3), so the link is valid today.
--
-- DATA-PRESERVING + idempotent: only appends; re-running is a no-op (skips any
-- page that already has the s_cta section). lead_pages is untouched.
-- ════════════════════════════════════════════════════════════════

UPDATE site_pages sp
SET sections = sp.sections || jsonb_build_array(
  jsonb_build_object(
    'id', 's_cta', 'type', 'cta', 'style', '{}'::jsonb,
    'props', jsonb_build_object(
      'label', 'לקביעת פגישה',
      'action', jsonb_build_object(
        'type', 'link',
        'url', 'https://simplicity-os.com/book/' || (lp.content->>'bookingPageRef')
      ),
      'style', 'secondary'
    )
  )
)
FROM lead_pages lp
WHERE sp.kind = 'lead'
  AND sp.user_id = lp.user_id
  AND sp.created_at = lp.created_at        -- the 0068 idempotency key
  AND lp.deleted_at IS NULL
  AND COALESCE(lp.content->>'bookingPageRef', '') <> ''
  -- Don't double-append if this corrective already ran.
  AND NOT (sp.sections @> '[{"id":"s_cta"}]'::jsonb);

NOTIFY pgrst, 'reload schema';
