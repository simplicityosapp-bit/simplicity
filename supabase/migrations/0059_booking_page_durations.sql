-- ════════════════════════════════════════════════════════════════
--  0059 — booking_pages: per-PAGE meeting-type durations
-- ════════════════════════════════════════════════════════════════
--  Until now a meeting type's length lived ONLY on the global
--  `meeting_types.duration_minutes` row, so editing the duration on one
--  booking page silently changed it on every other page that offered the
--  same type (and wrote to the DB on every keystroke). The owner decided
--  duration is PER PAGE: changing it on page A must NOT affect page B.
--
--  This adds a per-page override map and BACKFILLS it from each type's
--  current duration, so every EXISTING page keeps exactly the length it
--  shows today — even if the global type duration later changes.
--
--    meeting_type_durations — jsonb { "<meeting_type_id>": <minutes>, … }.
--                             Per-page override. When a page has no entry
--                             for a chosen type, the edge function falls
--                             back to meeting_types.duration_minutes, then
--                             to the page's defaultDurationMinutes.
--
--  meeting_types.duration_minutes is KEPT: it is the default applied when a
--  type is newly added to a page, and the fallback above. No data dropped.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.booking_pages
  ADD COLUMN IF NOT EXISTS meeting_type_durations jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: for every page, snapshot the current duration of each meeting
-- type it offers (only types that have a preset duration). Pages with no
-- offered types — or whose types have no preset duration — stay '{}'.
UPDATE public.booking_pages bp
SET meeting_type_durations = sub.dur
FROM (
  SELECT bp2.id,
         jsonb_object_agg(mt.id::text, mt.duration_minutes)
           FILTER (WHERE mt.duration_minutes IS NOT NULL) AS dur
  FROM public.booking_pages bp2
  CROSS JOIN LATERAL jsonb_array_elements_text(bp2.meeting_type_ids) AS mtid(id)
  JOIN public.meeting_types mt ON mt.id::text = mtid.id
  GROUP BY bp2.id
) sub
WHERE bp.id = sub.id
  AND sub.dur IS NOT NULL;

NOTIFY pgrst, 'reload schema';
