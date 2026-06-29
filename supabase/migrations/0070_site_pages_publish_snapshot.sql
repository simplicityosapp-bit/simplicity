-- ════════════════════════════════════════════════════════════════
-- Migration 0070 — Draft vs published versioning for site_pages
-- Date: 2026-06-25
-- ════════════════════════════════════════════════════════════════
-- Separate the LIVE version a visitor sees from the DRAFT the coach edits.
-- The editor keeps saving the draft into theme/sections/config (unchanged);
-- a new `published_snapshot` jsonb holds the last *published* version
-- ({ theme, sections, config }). The public edge function serves the
-- snapshot, so saving a draft no longer leaks half-edited content to visitors.
--
-- Additive + data-preserving: one new nullable column. Backfill every
-- currently-published page's snapshot from its present content so nothing
-- changes for live pages. The edge function also falls back to the live
-- fields when the snapshot is null, so this is safe even before the backfill.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS published_snapshot jsonb;

-- Backfill: published pages keep serving their current content as the snapshot.
UPDATE site_pages
SET published_snapshot = jsonb_build_object('theme', theme, 'sections', sections, 'config', config)
WHERE published = true AND published_snapshot IS NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
