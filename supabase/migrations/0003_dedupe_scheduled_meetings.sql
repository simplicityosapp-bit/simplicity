-- ============================================================
-- Migration 0003 — dedupe scheduled_meetings + UNIQUE guard
-- Date: 2026-05-28
--
-- Background
--   The materialisation engine for scheduled_meetings has been
--   racing the initial fetch: on every page load, the engine fired
--   with the empty default meetings array (state still hydrating
--   from Supabase) and re-created rows for every slot. The
--   ref-latch guarded against re-entrance inside one effect
--   lifecycle, but not across separate effect runs triggered by
--   different mounts/refreshes. Result: thousands of duplicates
--   pointing at the same (user_id, subject_type, subject_id,
--   scheduled_at).
--
--   The engine itself is now gated on the hook's `loading` flag
--   (commit alongside this migration). To recover the existing
--   data + lock the contract at the DB level, this migration:
--
--     1. deletes every duplicate row, keeping the oldest by
--        created_at per (user_id, subject_type, subject_id,
--        scheduled_at) tuple.
--     2. adds a UNIQUE constraint enforcing the tuple going
--        forward, so any future engine bug surfaces as a 23505
--        instead of silently piling up rows.
--
-- Idempotent
--   - The DELETE uses NOT IN with the surviving id set, which
--     is safe to re-run (becomes a no-op once dedup is done).
--   - The UNIQUE constraint creation guards with IF NOT EXISTS
--     via the catalog check.
-- ============================================================

-- Step 1 — collapse duplicates. For each (user_id, subject_type,
-- subject_id, scheduled_at) we keep the row with the earliest
-- created_at (the original; replays should be the duplicates).
DELETE FROM scheduled_meetings
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, subject_type, subject_id, scheduled_at) id
  FROM scheduled_meetings
  ORDER BY user_id, subject_type, subject_id, scheduled_at, created_at ASC
);

-- Step 2 — enforce uniqueness going forward.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scheduled_meetings_user_subject_at_uniq'
      AND conrelid = 'scheduled_meetings'::regclass
  ) THEN
    ALTER TABLE scheduled_meetings
      ADD CONSTRAINT scheduled_meetings_user_subject_at_uniq
      UNIQUE (user_id, subject_type, subject_id, scheduled_at);
  END IF;
END
$$;
