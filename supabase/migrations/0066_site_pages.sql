-- ════════════════════════════════════════════════════════════════
-- Migration 0066 — Site Pages (unified page-builder model)
-- Date: 2026-06-25
-- ════════════════════════════════════════════════════════════════
-- Phase 0 of the page-builder project (docs/page-builder-plan.md).
--
-- One unified table powering a hub of THREE page kinds, all on one shared
-- block engine:
--   • 'landing' — full multi-section landing page (the new flexible builder)
--   • 'lead'    — lead-capture page (folds in from lead_pages in phase 2)
--   • 'booking' — appointment booking page (folds in from booking_pages, phase 3)
--
-- A page is an ordered list of SECTIONS ({id,type,props,style}) plus a page
-- THEME (font/palette/background) plus kind-specific CONFIG (lead approval,
-- booking availability, etc.). All three live in JSONB so phases 2-3 can fold
-- the legacy lead_pages / booking_pages rows in WITHOUT reshaping this table.
--
-- Like lead_pages / booking_pages, the public page NEVER touches the DB
-- directly — a service-role edge function maps page → user_id, validates, and
-- writes. Therefore site_pages stays OWNER-ONLY at the RLS level (no anon).
--
-- Additive + data-preserving:
--   • one new table, no existing data, nothing dropped or rewritten.
--   • the legacy lead_pages / booking_pages tables are LEFT UNTOUCHED here;
--     their builders keep working until phases 2-3 migrate + verify them.
--   Re-running is a no-op (IF NOT EXISTS / DROP-then-CREATE on policy+trigger).
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the page-builder edge
-- function (a later phase) — that function reads/writes site_pages.
-- ════════════════════════════════════════════════════════════════

-- ── site_pages — one row per builder page ───────────────────────────────────
CREATE TABLE IF NOT EXISTS site_pages (
  id         uuid DEFAULT gen_random_uuid() NOT NULL,
  -- the OWNER (coach). On the public side this comes ONLY from the page row
  -- server-side (never client-supplied), so a visitor can never forge it.
  user_id    uuid NOT NULL,
  -- which builder produced this page; selects the kind-specific surfaces.
  kind       text NOT NULL DEFAULT 'landing',
  -- internal name the coach uses to identify the page (not shown publicly).
  title      text NOT NULL DEFAULT '',
  -- draft vs live. A non-published page returns 404 from the edge function.
  published  boolean NOT NULL DEFAULT false,
  -- short readable public link; NULL → use the uuid. Public route by kind:
  --   landing → /p/<slug>, lead → /lead/<slug>, booking → /book/<slug>.
  slug       text,
  -- page-level design: {
  --   font, palette:{...}, textColor, textAlign,
  --   background:{ type:'scene'|'image'|'flat', value },   // scene key OR asset url OR color
  --   cardOpacity, cardBlur, cardRadius, ...
  -- } — derived from the Mångata tokens.
  theme      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ordered list of sections: [{ id, type, props, style }]
  --   type ∈ hero | text | image | iconText | testimonial | cta | form
  --          | booking | spacer  (extensible)
  sections   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- kind-specific settings that are NOT visual sections, e.g.
  --   lead:    { autoApprove, fields:[...], thankYou:{...} }
  --   booking: { autoConfirm, availability:{...}, meetingTypeIds:[...],
  --              meetingTypeDurations:{...}, writeToGoogle, inviteClient,
  --              thankYou:{...} }
  --   landing: { }   // the form/booking SECTIONS carry their own config
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- submissions inherit this project for attribution (like lead_pages).
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  CONSTRAINT site_pages_pkey PRIMARY KEY (id),
  CONSTRAINT site_pages_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT site_pages_kind_chk
    CHECK (kind IN ('landing', 'lead', 'booking'))
);

-- Slug format guard: lowercase letters/digits/hyphens, 3–40 chars, no
-- leading/trailing hyphen. NULL always passes. (Mirrors lead_pages 0048.)
ALTER TABLE site_pages DROP CONSTRAINT IF EXISTS site_pages_slug_format;
ALTER TABLE site_pages ADD CONSTRAINT site_pages_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

CREATE INDEX IF NOT EXISTS idx_site_pages_user ON public.site_pages (user_id);
-- Case-insensitive slug uniqueness is PER KIND among non-deleted pages: the
-- three kinds live at different public routes (/p, /lead, /book), so the same
-- slug may exist once per kind without colliding — and the phase 2-3 fold-in of
-- legacy lead/booking slugs stays conflict-free.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_pages_kind_slug_unique
  ON public.site_pages (kind, lower(slug))
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;

-- Owner-only. Published pages are reached exclusively through the service-role
-- edge function, so there is intentionally NO anon/public policy.
DROP POLICY IF EXISTS site_pages_own ON site_pages;
CREATE POLICY site_pages_own ON site_pages
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_site_pages_updated ON public.site_pages;
CREATE TRIGGER trg_site_pages_updated
  BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
