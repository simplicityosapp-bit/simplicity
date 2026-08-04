-- 0108_scheduled_meeting_duration.sql
-- Give a scheduled meeting a length of its own.
--
-- Until now the day view had no way to know how long a meeting runs. It
-- derived an end from the SUBJECT's recurring_end_time — a property of the
-- client or group, not of the meeting — and where that was absent it drew a
-- flat 60-minute block on an assumption. So a 90-minute workshop and a
-- 25-minute check-in were the same rectangle on the timeline, and the one
-- screen whose job is to show the shape of a day was showing a guess.
--
-- Named duration_minutes to match meeting_types.duration_minutes, which has
-- carried exactly this quantity since the booking pages shipped. Same unit,
-- same nullability, same name — there is no reason for the calendar to invent
-- a second vocabulary for a meeting's length.
--
-- NULL keeps today's behaviour precisely, which is what makes this safe to
-- apply ahead of the code: every existing row stays NULL and every reader
-- falls back exactly as it does now (subject's recurring_end_time, then the
-- 60-minute assumption). The generator that materialises recurring meetings
-- deliberately does NOT set it — a series' length still belongs to the
-- series, and only a meeting booked by hand carries its own.
--
-- Additive, nullable, IF NOT EXISTS → no backfill, no data change, no DROP.

ALTER TABLE public.scheduled_meetings
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- A meeting cannot run for zero or negative time. Left NOT VALID-free because
-- the column is new and every existing row is NULL, which the check admits.
ALTER TABLE public.scheduled_meetings
  DROP CONSTRAINT IF EXISTS scheduled_meetings_duration_check;
ALTER TABLE public.scheduled_meetings
  ADD CONSTRAINT scheduled_meetings_duration_check
  CHECK (duration_minutes IS NULL OR duration_minutes > 0);

COMMENT ON COLUMN public.scheduled_meetings.duration_minutes IS
  'Length of this meeting in minutes. NULL = fall back to the subject''s recurring_end_time, then to the 60-minute default the day view assumes.';
