-- ════════════════════════════════════════════════════════════════
-- Migration 0114 — landing funnel: signup_complete
-- ════════════════════════════════════════════════════════════════
-- Closes the landing funnel. Until now the "completed signup" stage was
-- derived from auth.users (every signup in the range), which counts people
-- who never saw the landing page — so it could not answer "how many of the
-- visitors who clicked the CTA actually opened an account". A new event type
-- carries the landing session_id through to the moment the account is created,
-- so view → signup_start → signup_complete all sit on ONE session id.
--
-- Sent once per signup, with the stored landing session id, or the literal
-- 'direct' when the person never passed through the landing page.
--
-- STILL ANONYMOUS: no new column, no user_id, no PII — only one more allowed
-- value in the existing type CHECK.
--
-- DATA SAFETY: replaces the CHECK constraint with a SUPERSET of its current
-- values (0051's list + 'signup_complete'), so every existing row still
-- satisfies it; no rows are read, rewritten or deleted. Idempotent
-- (DROP IF EXISTS then ADD).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE landing_events DROP CONSTRAINT IF EXISTS landing_events_type_check;
ALTER TABLE landing_events ADD CONSTRAINT landing_events_type_check
  CHECK (type IN (
    'view', 'signup_start', 'signup_complete',
    'scroll_50', 'scroll_75', 'scroll_100',
    'faq_open', 'engaged'
  ));

NOTIFY pgrst, 'reload schema';
