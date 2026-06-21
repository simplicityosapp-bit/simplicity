-- ════════════════════════════════════════════════════════════════
-- Migration 0046 — Lead Pages (public lead-capture landing pages)
-- Date: 2026-06-21
-- ════════════════════════════════════════════════════════════════
-- A coach can build public landing pages under simplicity-os.com/lead/<id>.
-- A visitor fills the form and becomes a LEAD in the coach's account. The
-- public page never touches the DB directly — a service-role edge function
-- (`lead-intake`) maps page → user_id, validates, rate-limits, and inserts.
-- Therefore `lead_pages` stays OWNER-ONLY at the RLS level (no anon access);
-- the edge function reads the published config with the service role.
--
-- Form submissions do NOT enter the official lead list immediately: they land
-- as `pending_review = true` and surface in "דורש תשומת לב" + a review section
-- on /leads, entering the kanban only after manual approval — UNLESS the page
-- has `auto_approve = true` (the coach opted into automatic intake).
--
-- Additive + data-preserving:
--   • new table `lead_pages` (no existing data).
--   • four nullable/defaulted columns on `leads`. `pending_review` defaults
--     FALSE so EVERY existing lead stays in the official list — no backfill.
--   • email / data / page_id default NULL on existing rows (intended).
-- Re-running is a no-op (IF NOT EXISTS throughout).
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the `lead-intake` edge
-- function — the function writes page_id / data / pending_review and reads
-- lead_pages; without the columns/table it would error.
-- ════════════════════════════════════════════════════════════════

-- ── 1) lead_pages — the builder config, one row per public page ──────────────
CREATE TABLE IF NOT EXISTS lead_pages (
  id           uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid NOT NULL,
  -- internal name the coach uses to identify the page (not shown publicly)
  title        text NOT NULL DEFAULT '',
  -- draft vs live. A non-published page returns 404 from the edge function.
  published    boolean NOT NULL DEFAULT false,
  -- skip the manual-approval gate: submissions land straight in the list.
  auto_approve boolean NOT NULL DEFAULT false,
  -- branding + copy: { logoText, heading, body, brandColor, thankYou:{ mode:'message'|'redirect', message, url } }
  content      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ordered field defs: [{ key, label, type, required, builtin }]
  fields       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at   timestamp with time zone,
  CONSTRAINT lead_pages_pkey PRIMARY KEY (id),
  CONSTRAINT lead_pages_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_pages_user ON public.lead_pages (user_id);

ALTER TABLE lead_pages ENABLE ROW LEVEL SECURITY;

-- Owner-only. The public page reaches published pages exclusively through the
-- service-role edge function, so there is intentionally NO anon/public policy.
DROP POLICY IF EXISTS lead_pages_own ON lead_pages;
CREATE POLICY lead_pages_own ON lead_pages
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_lead_pages_updated ON public.lead_pages;
CREATE TRIGGER trg_lead_pages_updated
  BEFORE UPDATE ON public.lead_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2) leads — capture page origin, email, dynamic answers, review gate ──────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS page_id        uuid REFERENCES lead_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email          text,
  ADD COLUMN IF NOT EXISTS data           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_page ON public.leads (page_id);
-- Partial index: the review section / attention widget query only the few
-- pending rows, so keep the index tiny.
CREATE INDEX IF NOT EXISTS idx_leads_pending_review
  ON public.leads (user_id) WHERE pending_review;

NOTIFY pgrst, 'reload schema';
