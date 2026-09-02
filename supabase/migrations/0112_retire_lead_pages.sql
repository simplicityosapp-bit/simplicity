-- ════════════════════════════════════════════════════════════════
-- Migration 0112 — retire the legacy lead pages (close the public intake)
-- Date: 2026-08-27
-- ════════════════════════════════════════════════════════════════
-- The `lead-intake` edge function was a public, service-role endpoint serving
-- the original lead pages. Its source was deleted from the repo when the legacy
-- lead-page code was retired, but the DEPLOYMENT was never removed — so it kept
-- running in production with no reviewable source. A copy is preserved at
-- supabase/archive/lead-intake/ and the deployment is being deleted.
--
-- It resolves a page by uuid OR by custom slug, and the one published row's slug
-- was a guessable word. Anyone could therefore post leads into that account.
-- They arrived as pending_review, so this was spam rather than a data leak — but
-- it was reachable from the open internet.
--
-- This migration closes it at the data layer, which is the part that keeps
-- holding even if the function is ever redeployed by accident: `lead-intake`
-- selects with `published = true`, so an unpublished page 404s.
--
-- NOT a schema change and NOT a delete. The row, its content and its slug all
-- stay exactly where they are — only the published flag flips, so this is
-- reversible with a single UPDATE. `leads.page_id` is untouched (and is null on
-- every row: no lead ever came through a lead page).
--
-- The successor is already live: site_pages (migration 0068) with kind='lead',
-- served by site-intake. The /lead/:pageId route was repointed to it earlier,
-- which is why nothing in the app calls lead-intake any more.
-- ════════════════════════════════════════════════════════════════

UPDATE public.lead_pages
   SET published = false
 WHERE published;

-- Verification (expect published_pages = 0):
--   SELECT count(*) FILTER (WHERE published) AS published_pages,
--          count(*)                          AS total_rows
--     FROM public.lead_pages;
