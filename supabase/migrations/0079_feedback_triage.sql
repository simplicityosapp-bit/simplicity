-- ════════════════════════════════════════════════════════════════
-- 0079_feedback_triage — move the feedback backlog's triage layer into
-- public.feedback so reading + marking happens directly in Supabase
-- (admin console), replacing the external Notion board.
-- ════════════════════════════════════════════════════════════════
-- The `feedback` row is already the source of truth (send-feedback edge).
-- These are the triage/workflow fields that previously lived ONLY in Notion:
-- classification, surface (technical/design), platform, title, notes, source.
--
-- Data safety: every new column is nullable or has a DEFAULT, so existing
-- rows keep working unchanged. `source` backfills to 'app' (all existing
-- feedback came through the in-app form). No DROP of data columns.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS platform       text,                        -- mobile | desktop | both | unknown (auto-detected at submit, admin-editable)
  ADD COLUMN IF NOT EXISTS source         text NOT NULL DEFAULT 'app', -- app | email | manual (where the item entered the backlog)
  ADD COLUMN IF NOT EXISTS classification text,                        -- triage decision: bug | dev | unclear (distinct from the user's self-reported `type`)
  ADD COLUMN IF NOT EXISTS surface        text,                        -- technical | design | both
  ADD COLUMN IF NOT EXISTS title          text,                        -- short triage summary (Notion "כותרת")
  ADD COLUMN IF NOT EXISTS notes          text;                        -- triage direction + fix log with commit/merge hashes (Notion "הערות")

-- Widen the status set to Notion parity. Existing rows are already
-- new/in_progress/done, so widening the CHECK never rejects a stored value.
--   new              = פתוח
--   in_progress      = בעבודה / בוצע וממתין לעדכון בגיט
--   waiting_decision = ממתין להחלטה
--   done             = טופל
--   rejected         = נדחה
ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_status_check;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_status_check
  CHECK (status = ANY (ARRAY['new'::text, 'in_progress'::text, 'waiting_decision'::text, 'done'::text, 'rejected'::text]));

-- Permissive enum guards on the new triage columns (NULL always allowed).
ALTER TABLE public.feedback ADD CONSTRAINT feedback_platform_check
  CHECK (platform IS NULL OR platform = ANY (ARRAY['mobile'::text, 'desktop'::text, 'both'::text, 'unknown'::text]));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_source_check
  CHECK (source = ANY (ARRAY['app'::text, 'email'::text, 'manual'::text]));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_classification_check
  CHECK (classification IS NULL OR classification = ANY (ARRAY['bug'::text, 'dev'::text, 'unclear'::text]));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_surface_check
  CHECK (surface IS NULL OR surface = ANY (ARRAY['technical'::text, 'design'::text, 'both'::text]));

-- Backlog board filters by triage classification.
CREATE INDEX IF NOT EXISTS idx_feedback_classification ON public.feedback USING btree (classification);
