-- ════════════════════════════════════════════════════════════════
--  0054 — booking_pages: per-page Google Calendar write settings
-- ════════════════════════════════════════════════════════════════
--  Phase 6 of public booking pages: writing a CONFIRMED booking to the
--  coach's Google Calendar. Two per-page opt-in flags, both OFF by default
--  so every EXISTING page keeps its current behaviour (no Google writes)
--  until the coach turns it on. No data is dropped or transformed.
--
--    write_to_google — when true, a confirmed booking from this page (manual
--                      OR auto-confirm) is written to the coach's primary
--                      Google Calendar (best-effort; requires a connected
--                      Google account with the calendar.events scope).
--    invite_client   — when true (and write_to_google is on), the visitor's
--                      email is added as an attendee so Google sends them an
--                      invitation. Only meaningful when write_to_google is on.
--
--  The booking's google_event_id column already exists (migration 0052).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_pages
  ADD COLUMN IF NOT EXISTS write_to_google boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_client   boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
