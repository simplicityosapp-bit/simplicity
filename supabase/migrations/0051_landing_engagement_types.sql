-- ════════════════════════════════════════════════════════════════
-- Migration 0051 — landing engagement event types
-- ════════════════════════════════════════════════════════════════
-- Widens landing_events.type to cover engagement signals on top of the
-- funnel events (0050): scroll depth (50/75/100%), FAQ opens, and a 30s
-- "read" signal. Still anonymous + aggregate — no new columns, no PII.
--
-- DATA SAFETY: only replaces a CHECK constraint with a SUPERSET of values,
-- so every existing row still satisfies it; no data is rewritten. Idempotent
-- (DROP IF EXISTS then ADD).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE landing_events DROP CONSTRAINT IF EXISTS landing_events_type_check;
ALTER TABLE landing_events ADD CONSTRAINT landing_events_type_check
  CHECK (type IN (
    'view', 'signup_start',
    'scroll_50', 'scroll_75', 'scroll_100',
    'faq_open', 'engaged'
  ));

NOTIFY pgrst, 'reload schema';
