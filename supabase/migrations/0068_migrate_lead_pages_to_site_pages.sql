-- ════════════════════════════════════════════════════════════════
-- Migration 0068 — Fold lead_pages into the page-builder engine
-- Date: 2026-06-25
-- ════════════════════════════════════════════════════════════════
-- Phase 2 of the page-builder project. Converts every existing lead-capture
-- page (lead_pages) into a unified site_pages row (kind='lead') on the block
-- engine: branding → theme, heading/logo/body → a `hero` section, the form
-- fields → a `form` section, auto_approve + thankYou → config.
--
-- DATA-PRESERVING + REVERSIBLE:
--   • lead_pages is NOT touched — it stays intact as a full backup. Nothing
--     is dropped. If anything looks wrong, the old rows are still there and
--     the old /lead renderer + lead-intake still work until we flip the route.
--   • Idempotent: re-running inserts nothing new (guarded by matching the
--     copied created_at + user_id + kind), so it is safe to run twice.
--   • Soft-deleted lead pages (deleted_at not null) are skipped.
--
-- AFTER this migration is verified, a follow-up step switches the public
-- /lead/<slug> route to the engine renderer + site-intake (the code change,
-- not this migration).
-- ════════════════════════════════════════════════════════════════

INSERT INTO site_pages (user_id, kind, title, published, slug, theme, sections, config, project_id, created_at, updated_at)
SELECT
  lp.user_id,
  'lead',
  lp.title,
  lp.published,
  lp.slug,
  -- ── theme (page-level design) ──────────────────────────────────────────
  jsonb_build_object(
    'font', 'heebo',
    'brandColor', COALESCE(NULLIF(lp.content->>'brandColor', ''), '#C97B5E'),
    'textColor', COALESCE(NULLIF(lp.content->>'textColor', ''), 'dark'),
    'textAlign', COALESCE(NULLIF(lp.content->>'textAlign', ''), 'start'),
    'bold', COALESCE((lp.content->>'bold')::boolean, false),
    'background', CASE
      WHEN COALESCE(lp.content->>'background', '') <> ''
        THEN jsonb_build_object('type', 'scene', 'value', lp.content->>'background')
      ELSE jsonb_build_object('type', 'flat', 'value', '#f7f3ee')
    END,
    'cardOpacity', COALESCE((lp.content->>'cardOpacity')::int, 100),
    'cardBlur', COALESCE((lp.content->>'cardBlur')::int, 14),
    'cardRadius', COALESCE((lp.content->>'cardRadius')::int, 24)
  ),
  -- ── sections: a hero (only when there's copy) + the form ───────────────
  CASE
    WHEN COALESCE(lp.content->>'heading', '') <> ''
      OR COALESCE(lp.content->>'body', '') <> ''
      OR COALESCE(lp.content->>'logoText', '') <> ''
    THEN jsonb_build_array(
      jsonb_build_object(
        'id', 's_1', 'type', 'hero', 'style', '{}'::jsonb,
        'props', jsonb_build_object(
          'eyebrow', COALESCE(lp.content->>'logoText', ''),
          'heading', COALESCE(lp.content->>'heading', ''),
          'subheading', COALESCE(lp.content->>'body', ''),
          'ctaLabel', '',
          'ctaAction', jsonb_build_object('type', 'scrollToForm', 'url', '')
        )
      ),
      jsonb_build_object(
        'id', 's_2', 'type', 'form', 'style', '{}'::jsonb,
        'props', jsonb_build_object(
          'heading', '', 'submitLabel', 'שליחה',
          'fields', COALESCE(lp.fields, '[]'::jsonb)
        )
      )
    )
    ELSE jsonb_build_array(
      jsonb_build_object(
        'id', 's_1', 'type', 'form', 'style', '{}'::jsonb,
        'props', jsonb_build_object(
          'heading', '', 'submitLabel', 'שליחה',
          'fields', COALESCE(lp.fields, '[]'::jsonb)
        )
      )
    )
  END,
  -- ── config (kind-specific, non-visual) ─────────────────────────────────
  jsonb_build_object(
    'autoApprove', COALESCE(lp.auto_approve, false),
    'thankYou', lp.content->'thankYou'
  ),
  lp.project_id,
  lp.created_at,
  now()
FROM lead_pages lp
WHERE lp.deleted_at IS NULL
  -- Idempotency: skip a lead page already folded in (created_at is copied
  -- verbatim, so it uniquely re-identifies the migrated row per user).
  AND NOT EXISTS (
    SELECT 1 FROM site_pages sp
    WHERE sp.kind = 'lead'
      AND sp.user_id = lp.user_id
      AND sp.created_at = lp.created_at
  );

NOTIFY pgrst, 'reload schema';
