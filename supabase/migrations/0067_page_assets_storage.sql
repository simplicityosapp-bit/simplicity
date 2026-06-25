-- ════════════════════════════════════════════════════════════════
-- Migration 0067 — Page Assets storage bucket (page-builder image upload)
-- Date: 2026-06-25
-- ════════════════════════════════════════════════════════════════
-- Phase 0 of the page-builder project (docs/page-builder-plan.md).
--
-- A PUBLIC bucket `page-assets` holding coach-uploaded images for builder pages
-- (logos, hero/section photos, custom backgrounds). Public pages are served to
-- anonymous visitors, so the bucket must be world-READABLE — but only the
-- OWNER may write, and only inside their own `<uid>/…` folder.
--
-- Limits are enforced at the bucket level (can't be bypassed by a crafted
-- client): 5 MB per file, images only.
--
-- Additive + idempotent: ON CONFLICT DO NOTHING on the bucket, DROP-then-CREATE
-- on each policy. Re-running is a no-op. Nothing existing is touched.
--
-- NOTE: run this in the Supabase SQL editor (it owns the storage schema).
-- ════════════════════════════════════════════════════════════════

-- ── 1) the bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'page-assets', 'page-assets', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2) RLS policies on storage.objects (scoped to this bucket) ───────────────
-- Public READ: anyone may read objects in page-assets (needed for public pages).
DROP POLICY IF EXISTS "page_assets_public_read" ON storage.objects;
CREATE POLICY "page_assets_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'page-assets');

-- Owner WRITE: an authenticated user may insert/update/delete ONLY within their
-- own first-segment folder (`<uid>/…`). storage.foldername(name)[1] = the uid.
DROP POLICY IF EXISTS "page_assets_owner_insert" ON storage.objects;
CREATE POLICY "page_assets_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'page-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "page_assets_owner_update" ON storage.objects;
CREATE POLICY "page_assets_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'page-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'page-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "page_assets_owner_delete" ON storage.objects;
CREATE POLICY "page_assets_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'page-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
