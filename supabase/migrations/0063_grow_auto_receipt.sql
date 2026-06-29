-- ════════════════════════════════════════════════════════════════
-- Migration 0063 — Grow auto-receipt opt-in (Phase 4)
-- Date: 2026-06-28
-- ════════════════════════════════════════════════════════════════
-- Per-coach opt-in: when a Grow payment is recorded, ALSO auto-issue a
-- receipt through the connected invoice provider (Green Invoice / SUMIT)
-- for the same income transaction. Issuing a tax document must be explicit,
-- so this defaults to OFF — and the grow-webhook only acts when the coach
-- has BOTH a Grow connection AND an invoice provider connected.
--
-- Stored on the coach's Grow row in user_integrations (provider='grow').
-- Additive, nullable-with-default, no data touched. Re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS grow_auto_receipt boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
