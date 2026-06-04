-- ════════════════════════════════════════════════════════════════
-- Migration 0014 — per-session billing for private clients
-- (per-session-billing.spec.md, approved 04/06/2026)
-- ════════════════════════════════════════════════════════════════
-- Mirrors groups.billing_mode (without 'none'): 'package' keeps the
-- sessions × price model; 'per_session' accrues the private total
-- from sessions actually held.
-- DATA SAFETY: additive only — every existing client defaults to
-- 'package', so no existing balance changes.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'package';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_billing_mode_check'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT clients_billing_mode_check
      CHECK (billing_mode IN ('package','per_session'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
