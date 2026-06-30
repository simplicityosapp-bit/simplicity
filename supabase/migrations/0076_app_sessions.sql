-- ════════════════════════════════════════════════════════════════════════
-- 0076 — app_sessions: app-usage session tracking for admin analytics
-- ════════════════════════════════════════════════════════════════════════
-- A row is recorded ONCE per browser tab-session when an authenticated user
-- opens the app (client beacon in src/lib/api/appSession.js, fired from
-- AuthProvider). This is the "session" the admin analytics counts as activity
-- — DISTINCT from the existing `sessions` table, which holds COACHING sessions
-- with clients. Content-free: only user_id + timestamp (no PII beyond the id).
--
-- Additive + idempotent. New table → no existing rows to back-fill.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists app_sessions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null,
  created_at timestamptz not null default now()
);

create index if not exists app_sessions_created_at_idx on app_sessions (created_at);
create index if not exists app_sessions_user_id_idx     on app_sessions (user_id);

alter table app_sessions enable row level security;

-- A signed-in user may record (insert) only their OWN session rows. There is
-- no select/update/delete policy for regular users: the analytics are read
-- exclusively through the service-role `admin` edge function, which bypasses
-- RLS. So a user can write a heartbeat for themselves and nothing more.
drop policy if exists app_sessions_insert_own on app_sessions;
create policy app_sessions_insert_own on app_sessions
  for insert to authenticated
  with check (user_id = auth.uid());

-- Make the new table visible to PostgREST immediately.
notify pgrst, 'reload schema';
