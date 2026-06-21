-- ════════════════════════════════════════════════════════════════
-- Migration 0048 — Lead Pages: custom slug (short personal link)
-- Date: 2026-06-21
-- ════════════════════════════════════════════════════════════════
-- A page can have a short, readable slug so the public link is
-- simplicity-os.com/lead/<slug> instead of the raw uuid. The slug is
-- OPTIONAL — pages without one keep working via their uuid (the edge
-- function resolves the path param as a uuid OR a slug).
--
-- Slugs are GLOBALLY unique (case-insensitive) among active pages, since
-- /lead/<slug> is a single shared namespace across all users. Enforced by
-- a partial unique index; the app catches the 23505 violation on save and
-- asks for another slug (RLS prevents a client-side global availability
-- check, so the DB constraint is the source of truth).
--
-- Additive + data-preserving: one nullable column. Existing pages get
-- slug = NULL (use the uuid). Re-running is a no-op (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE lead_pages
  ADD COLUMN IF NOT EXISTS slug text;

-- Format guard: lowercase letters/digits/hyphens, 3–40 chars, no leading/
-- trailing hyphen. NULL always passes. (No existing slug data → safe to add.)
ALTER TABLE lead_pages DROP CONSTRAINT IF EXISTS lead_pages_slug_format;
ALTER TABLE lead_pages ADD CONSTRAINT lead_pages_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

-- Global case-insensitive uniqueness among non-deleted pages.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_pages_slug_unique
  ON public.lead_pages (lower(slug))
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
