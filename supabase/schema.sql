-- ============================================================
-- Mångata Database Schema
-- Generated for Supabase (PostgreSQL)
-- Source of truth: HTML for MVP/data md/data-model.md
-- Enum values: mangata-react/src/lib/enums.js
-- ============================================================
-- Conventions (every table unless noted):
--   id          uuid PK default gen_random_uuid()
--   user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE   (all except quotes)
--   created_at  timestamptz NOT NULL DEFAULT now()
--   updated_at  timestamptz NOT NULL DEFAULT now()   (auto via trigger; absent on append-only logs)
--   deleted_at  timestamptz                          (soft-delete tables only)
-- ============================================================

-- ============================================================
-- 1. updated_at trigger function (created once, reused)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. Tables (in FK-dependency order)
-- ============================================================

-- TABLE: projects
CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- TABLE: categories  (finance transaction categories)
CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- TABLE: lead_sources
CREATE TABLE lead_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- TABLE: goal_categories
CREATE TABLE goal_categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key               text,
  name              text NOT NULL,
  icon              text,
  color             text,
  measurement_type  text NOT NULL CHECK (measurement_type IN ('auto','manual')),
  data_source       text,
  graph_type        text NOT NULL CHECK (graph_type IN ('cumulative','delta')),
  builtin           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- TABLE: client_statuses  (D18 — flexible sub-statuses under 4 fixed meta categories)
CREATE TABLE client_statuses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_category text NOT NULL CHECK (meta_category IN ('active','wandering','past','no_status')),
  display_name  text NOT NULL,
  icon          text,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- TABLE: lead_statuses  (D24 — flexible sub-statuses under 4 fixed meta categories)
CREATE TABLE lead_statuses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_category text NOT NULL CHECK (meta_category IN ('in_process','converted','not_relevant','ghost')),
  display_name  text NOT NULL,
  color         text,
  icon          text,
  is_default    boolean NOT NULL DEFAULT false,
  legacy_key    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- TABLE: groups  (sub-project; lives under a project)
CREATE TABLE groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name              text NOT NULL,
  color             text,
  -- Billing (migration 0005): a group bills as a fixed package, per
  -- session held, or has no group-level price at all. package_* are
  -- nullable now so 'per_session' / 'none' groups can omit them.
  billing_mode      text NOT NULL DEFAULT 'package' CHECK (billing_mode IN ('package','per_session','none')),
  package_price     numeric,
  package_sessions  integer,
  price_per_session numeric,
  recurring_day     smallint CHECK (recurring_day BETWEEN 0 AND 6),
  recurring_time    text,
  recurring_end_time   text,                 -- slot end time (migration 0007)
  recurring_start_date date,                 -- series start (migration 0007)
  recurring_end_date   date,                 -- series end, null = open (migration 0007)
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','in_development','ended')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- TABLE: clients
CREATE TABLE clients (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  status            text NOT NULL CHECK (status IN ('active','wandering','past','no_status')),
  status_id         uuid REFERENCES client_statuses(id) ON DELETE SET NULL,
  status_meta       text NOT NULL CHECK (status_meta IN ('active','wandering','past','no_status')),
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  group_id          uuid REFERENCES groups(id) ON DELETE SET NULL,
  sessions          integer NOT NULL DEFAULT 0,
  price_per_session numeric NOT NULL DEFAULT 0,
  -- 'package' = sessions × price · 'per_session' = held sessions × price (migration 0014)
  billing_mode      text NOT NULL DEFAULT 'package' CHECK (billing_mode IN ('package','per_session')),
  total_override    numeric,
  has_custom_price  boolean NOT NULL DEFAULT false,
  balance_adjustment numeric NOT NULL DEFAULT 0,
  paid_adjustment   numeric NOT NULL DEFAULT 0,
  sessions_done_adjustment integer NOT NULL DEFAULT 0,
  recurring_day     smallint CHECK (recurring_day BETWEEN 0 AND 6),
  recurring_time    text,
  recurring_end_time   text,                 -- slot end time (migration 0007)
  recurring_start_date date,                 -- series start (migration 0007)
  recurring_end_date   date,                 -- series end, null = open (migration 0007)
  left_mid_process  boolean NOT NULL DEFAULT false,
  phone             text,
  notes             text,
  notes_updated_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- TABLE: group_members  (D20 — relation: a client may belong to several groups)
CREATE TABLE group_members (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id                  uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  client_id                 uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  joined_at                 timestamptz NOT NULL,
  left_at                   timestamptz,
  total_override            numeric,
  has_custom_price          boolean NOT NULL DEFAULT false,
  package_sessions_override integer,
  left_mid_process          boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

-- TABLE: client_status_log  -- append-only, no updates
CREATE TABLE client_status_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  old_status  text CHECK (old_status IN ('active','wandering','past','no_status')),
  new_status  text NOT NULL CHECK (new_status IN ('active','wandering','past','no_status')),
  changed_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- TABLE: transactions  (finance)
-- NOTE: recurring_id FK added later (recurring_templates created after this table).
CREATE TABLE transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        numeric NOT NULL,
  type          text NOT NULL CHECK (type IN ('income','expense')),
  "desc"        text,
  date          date NOT NULL,
  status        text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','pending','skipped')),
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  recurring_id  uuid,
  orphaned_from jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- TABLE: recurring_templates
CREATE TABLE recurring_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        numeric NOT NULL,
  type          text NOT NULL CHECK (type IN ('income','expense')),
  "desc"        text,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  cadence_type  text NOT NULL DEFAULT 'monthly_date' CHECK (cadence_type IN ('monthly_date','weekly')),
  day_of_month  integer CHECK (day_of_month BETWEEN 1 AND 31),
  day_of_week   smallint CHECK (day_of_week BETWEEN 0 AND 6),
  until_date    date,
  trigger_type  text NOT NULL DEFAULT 'schedule' CHECK (trigger_type IN ('schedule','on_meeting')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- Deferred FK: transactions.recurring_id -> recurring_templates (forward reference, table order #11 before #12)
ALTER TABLE transactions
  ADD CONSTRAINT transactions_recurring_id_fkey
  FOREIGN KEY (recurring_id) REFERENCES recurring_templates(id) ON DELETE SET NULL;

-- TABLE: tasks
CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  priority      text NOT NULL CHECK (priority IN ('high','medium','low')),
  status        text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done')),
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- TABLE: leads
CREATE TABLE leads (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  phone                  text,
  source_id              uuid REFERENCES lead_sources(id) ON DELETE SET NULL,
  project_id             uuid REFERENCES projects(id) ON DELETE SET NULL,
  group_id               uuid REFERENCES groups(id) ON DELETE SET NULL,
  status                 text NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new','in_contact','intro_call','pending_decision','closed')),
  status_id              uuid REFERENCES lead_statuses(id) ON DELETE SET NULL,
  status_meta            text NOT NULL DEFAULT 'in_process'
                           CHECK (status_meta IN ('in_process','converted','not_relevant','ghost')),
  inquiry_date           date,
  follow_up_date         date,
  last_status_changed_at timestamptz,
  notes                  text,
  converted_to_client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  converted_at           timestamptz,
  closed_at              timestamptz,                    -- non-null when status_meta != 'in_process'
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

-- TABLE: lead_status_log  -- append-only, no updates
CREATE TABLE lead_status_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id         uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status_id  uuid REFERENCES lead_statuses(id) ON DELETE SET NULL,
  to_status_id    uuid NOT NULL REFERENCES lead_statuses(id) ON DELETE CASCADE,
  changed_at      timestamptz NOT NULL,
  source          text NOT NULL CHECK (source IN ('manual_drag','manual_select','converted','auto_expire')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- TABLE: sessions  (polymorphic — exactly one of client_id / group_id)
CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  group_id      uuid REFERENCES groups(id) ON DELETE CASCADE,
  subject_type  text NOT NULL CHECK (subject_type IN ('client','group')),
  subject_id    uuid NOT NULL,
  date          timestamptz NOT NULL,
  notes         text,
  summary       text,
  num           integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT sessions_subject_xor CHECK (
    (client_id IS NOT NULL AND group_id IS NULL) OR
    (client_id IS NULL AND group_id IS NOT NULL)
  )
);

-- TABLE: session_attachments
CREATE TABLE session_attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name        text NOT NULL,
  mime        text NOT NULL,
  size        integer,
  url         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- TABLE: client_notes  (dated timeline notes)
CREATE TABLE client_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- TABLE: scheduled_meetings  (system-managed meeting occurrences)
CREATE TABLE scheduled_meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type  text NOT NULL CHECK (subject_type IN ('client','group')),
  subject_id    uuid NOT NULL,
  scheduled_at  timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','skipped','expired')),
  session_id    uuid REFERENCES sessions(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_meetings_user_subject_at_uniq
    UNIQUE (user_id, subject_type, subject_id, scheduled_at)
);

-- TABLE: goals
-- NOTE: tracked_by_question_id FK added later (user_questions created after this table).
CREATE TABLE goals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id             uuid NOT NULL REFERENCES goal_categories(id) ON DELETE CASCADE,
  parent_goal_id          uuid REFERENCES goals(id) ON DELETE CASCADE,
  project_id              uuid REFERENCES projects(id) ON DELETE SET NULL,
  group_id                uuid REFERENCES groups(id) ON DELETE SET NULL,
  label                   text,
  time_frame              text NOT NULL CHECK (time_frame IN ('deadline','monthly','weekly')),
  target_value            numeric NOT NULL,
  target_date             date,
  importance              integer NOT NULL CHECK (importance BETWEEN 1 AND 5),
  tracking_method         text NOT NULL DEFAULT 'manual' CHECK (tracking_method IN ('manual','daily_question')),
  tracked_by_question_id  uuid,
  measurement_type        text CHECK (measurement_type IN ('auto','manual')),
  data_source             text,
  manual_input_type       text CHECK (manual_input_type IN ('number','slider','yes_no')),
  schedule_pattern        jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

-- TABLE: goal_entries  (manual value entries)
CREATE TABLE goal_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES goal_categories(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  group_id    uuid REFERENCES groups(id) ON DELETE SET NULL,
  date        date NOT NULL,
  value       numeric NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- TABLE: user_questions  (the user's active daily questions)
CREATE TABLE user_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key      text,
  custom_text       text,
  scale_type        text NOT NULL CHECK (scale_type IN ('1-10','yes_no','free_text')),
  icon              text,
  active            boolean NOT NULL DEFAULT true,
  "order"           integer NOT NULL DEFAULT 0,
  schedule_pattern  jsonb NOT NULL DEFAULT '{"type":"days_of_week","values":[0,1,2,3,4,5,6]}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT user_questions_source_chk CHECK (template_key IS NOT NULL OR custom_text IS NOT NULL)
);

-- Deferred FK: goals.tracked_by_question_id -> user_questions (forward reference, table order #20 before #22)
ALTER TABLE goals
  ADD CONSTRAINT goals_tracked_by_question_id_fkey
  FOREIGN KEY (tracked_by_question_id) REFERENCES user_questions(id) ON DELETE SET NULL;

-- TABLE: daily_answers  (one answer per question per day; value_num XOR value_text)
CREATE TABLE daily_answers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_question_id  uuid NOT NULL REFERENCES user_questions(id) ON DELETE CASCADE,
  date              date NOT NULL,
  value_num         numeric,
  value_text        text,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT daily_answers_value_xor CHECK (
    (value_num IS NOT NULL AND value_text IS NULL) OR
    (value_num IS NULL AND value_text IS NOT NULL)
  )
);

-- TABLE: moon_snapshots  (system-managed daily score snapshot)
CREATE TABLE moon_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date NOT NULL,
  score       numeric NOT NULL,
  paced       numeric,
  confidence  numeric,
  breakdown   jsonb,
  reflection  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moon_snapshots_user_date_uniq UNIQUE (user_id, date)
);

-- TABLE: reminders
CREATE TABLE reminders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  scheduled_at        timestamptz NOT NULL,
  recurrence_type     text NOT NULL DEFAULT 'none'
                        CHECK (recurrence_type IN ('none','weekly','monthly_date','every_x_days')),
  recurrence_pattern  jsonb,
  end_date            date,
  linked_to_type      text CHECK (linked_to_type IN ('client','project','group','task','transaction','lead','period')),
  -- NOTE: polymorphic, no FK. text (not uuid) because 'period' reminders store 'YYYY-MM' here (see summary).
  linked_to_id        text,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','triggered','completed','dismissed','snoozed')),
  type                text,
  channel             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

-- TABLE: reminder_occurrences  (O5 — lazy per-occurrence overrides; not soft-deleted)
CREATE TABLE reminder_occurrences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_id      uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  occurrence_date  text NOT NULL,
  status           text NOT NULL CHECK (status IN ('completed','skipped','rescheduled')),
  completed_at     timestamptz,
  date_override    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- TABLE: quotes  (system-managed; no user_id)
CREATE TABLE quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text        text NOT NULL,
  author      text,
  category    text,                              -- curated theme (migration 0015)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- TABLE: user_quotes  (personal quotes pool — migration 0013)
CREATE TABLE user_quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        text NOT NULL CHECK (char_length(btrim(text)) > 0),
  author      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- TABLE: user_preferences  (single row per user; preferences as one JSONB blob)
CREATE TABLE user_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_user_uniq UNIQUE (user_id)
);


-- ============================================================
-- updated_at triggers (every table that has updated_at;
-- excludes append-only logs client_status_log + lead_status_log)
-- ============================================================
CREATE TRIGGER trg_projects_updated            BEFORE UPDATE ON projects            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated          BEFORE UPDATE ON categories          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_sources_updated        BEFORE UPDATE ON lead_sources        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goal_categories_updated     BEFORE UPDATE ON goal_categories     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_statuses_updated     BEFORE UPDATE ON client_statuses     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_statuses_updated       BEFORE UPDATE ON lead_statuses       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_groups_updated              BEFORE UPDATE ON groups              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated             BEFORE UPDATE ON clients             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_group_members_updated       BEFORE UPDATE ON group_members       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_transactions_updated        BEFORE UPDATE ON transactions        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recurring_templates_updated BEFORE UPDATE ON recurring_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated               BEFORE UPDATE ON tasks               FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leads_updated               BEFORE UPDATE ON leads               FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated            BEFORE UPDATE ON sessions            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_session_attachments_updated BEFORE UPDATE ON session_attachments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_notes_updated        BEFORE UPDATE ON client_notes        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scheduled_meetings_updated  BEFORE UPDATE ON scheduled_meetings  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goals_updated               BEFORE UPDATE ON goals               FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goal_entries_updated        BEFORE UPDATE ON goal_entries        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_questions_updated      BEFORE UPDATE ON user_questions      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_daily_answers_updated       BEFORE UPDATE ON daily_answers       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_moon_snapshots_updated      BEFORE UPDATE ON moon_snapshots      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reminders_updated           BEFORE UPDATE ON reminders           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reminder_occurrences_updated BEFORE UPDATE ON reminder_occurrences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quotes_updated              BEFORE UPDATE ON quotes              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_quotes_updated         BEFORE UPDATE ON user_quotes         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_preferences_updated    BEFORE UPDATE ON user_preferences    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- TABLE: feedback  (in-app free-text feedback; emailed + stored)
CREATE TABLE feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message     text NOT NULL CHECK (char_length(btrim(message)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 3. Row Level Security
-- ============================================================
-- User-scoped tables: enable RLS + a single "own rows" policy (FOR ALL).
ALTER TABLE projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_statuses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_statuses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_meetings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_answers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE moon_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences    ENABLE ROW LEVEL SECURITY;
-- Append-only logs + quotes handled separately below.
ALTER TABLE client_status_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_status_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes              ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_own            ON projects            FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY categories_own          ON categories          FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY lead_sources_own        ON lead_sources        FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY goal_categories_own     ON goal_categories     FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY client_statuses_own     ON client_statuses     FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY lead_statuses_own       ON lead_statuses       FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY groups_own              ON groups              FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY clients_own             ON clients             FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY group_members_own       ON group_members       FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY transactions_own        ON transactions        FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY recurring_templates_own ON recurring_templates FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY tasks_own               ON tasks               FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY leads_own               ON leads               FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY sessions_own            ON sessions            FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY session_attachments_own ON session_attachments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY client_notes_own        ON client_notes        FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY scheduled_meetings_own  ON scheduled_meetings  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY goals_own               ON goals               FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY goal_entries_own        ON goal_entries        FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_questions_own      ON user_questions      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY daily_answers_own       ON daily_answers       FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY moon_snapshots_own      ON moon_snapshots      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY reminders_own           ON reminders           FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY reminder_occurrences_own ON reminder_occurrences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_preferences_own    ON user_preferences    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Append-only logs: SELECT + INSERT own rows only (no UPDATE / DELETE policy = blocked).
CREATE POLICY client_status_log_select ON client_status_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY client_status_log_insert ON client_status_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY lead_status_log_select   ON lead_status_log   FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY lead_status_log_insert   ON lead_status_log   FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- quotes: readable by everyone (authenticated); no client writes (no INSERT/UPDATE/DELETE policy).
CREATE POLICY quotes_select ON quotes FOR SELECT TO authenticated USING (true);

-- user_quotes: personal pool — own rows only (migration 0013).
ALTER TABLE user_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_quotes_own ON user_quotes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- feedback: submit + read own rows only (no UPDATE / DELETE policy = blocked).
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_select ON feedback FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY feedback_insert ON feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());


-- ============================================================
-- 4. Indexes (frequently-queried FK + filter columns)
-- ============================================================
CREATE INDEX idx_projects_user                ON projects (user_id);

CREATE INDEX idx_categories_user              ON categories (user_id);

CREATE INDEX idx_lead_sources_user            ON lead_sources (user_id);

CREATE INDEX idx_goal_categories_user         ON goal_categories (user_id);

CREATE INDEX idx_client_statuses_user         ON client_statuses (user_id);

CREATE INDEX idx_lead_statuses_user           ON lead_statuses (user_id);

CREATE INDEX idx_groups_user                  ON groups (user_id);
CREATE INDEX idx_groups_project               ON groups (project_id);
CREATE INDEX idx_groups_status                ON groups (status);

CREATE INDEX idx_clients_user                 ON clients (user_id);
CREATE INDEX idx_clients_project              ON clients (project_id);
CREATE INDEX idx_clients_group                ON clients (group_id);
CREATE INDEX idx_clients_status               ON clients (status);

CREATE INDEX idx_group_members_user           ON group_members (user_id);
CREATE INDEX idx_group_members_group          ON group_members (group_id);
CREATE INDEX idx_group_members_client         ON group_members (client_id);

CREATE INDEX idx_client_status_log_user       ON client_status_log (user_id);
CREATE INDEX idx_client_status_log_client     ON client_status_log (client_id);
CREATE INDEX idx_client_status_log_user_changed ON client_status_log (user_id, changed_at);  -- range/trend query (migration 0006)

CREATE INDEX idx_transactions_user            ON transactions (user_id);
CREATE INDEX idx_transactions_client          ON transactions (client_id);
CREATE INDEX idx_transactions_project         ON transactions (project_id);
CREATE INDEX idx_transactions_date            ON transactions (date);
CREATE INDEX idx_transactions_status          ON transactions (status);

CREATE INDEX idx_recurring_templates_user     ON recurring_templates (user_id);
CREATE INDEX idx_recurring_templates_client   ON recurring_templates (client_id);
CREATE INDEX idx_recurring_templates_project  ON recurring_templates (project_id);

CREATE INDEX idx_tasks_user                   ON tasks (user_id);
CREATE INDEX idx_tasks_client                 ON tasks (client_id);
CREATE INDEX idx_tasks_project                ON tasks (project_id);
CREATE INDEX idx_tasks_status                 ON tasks (status);

CREATE INDEX idx_leads_user                   ON leads (user_id);
CREATE INDEX idx_leads_status                 ON leads (status);
CREATE INDEX idx_leads_status_meta            ON leads (status_meta);
CREATE INDEX idx_leads_project                ON leads (project_id);
CREATE INDEX idx_leads_group                  ON leads (group_id);

CREATE INDEX idx_lead_status_log_user         ON lead_status_log (user_id);
CREATE INDEX idx_lead_status_log_lead         ON lead_status_log (lead_id);
CREATE INDEX idx_lead_status_log_user_changed ON lead_status_log (user_id, changed_at);  -- range/trend query (migration 0006)

CREATE INDEX idx_sessions_user                ON sessions (user_id);
CREATE INDEX idx_sessions_client              ON sessions (client_id);
CREATE INDEX idx_sessions_group               ON sessions (group_id);
CREATE INDEX idx_sessions_date                ON sessions (date);

CREATE INDEX idx_session_attachments_user     ON session_attachments (user_id);
CREATE INDEX idx_session_attachments_session  ON session_attachments (session_id);

CREATE INDEX idx_client_notes_user            ON client_notes (user_id);
CREATE INDEX idx_client_notes_client          ON client_notes (client_id);

CREATE INDEX idx_scheduled_meetings_user      ON scheduled_meetings (user_id);
CREATE INDEX idx_scheduled_meetings_subject   ON scheduled_meetings (subject_type, subject_id);
CREATE INDEX idx_scheduled_meetings_status    ON scheduled_meetings (status);

CREATE INDEX idx_goals_user                   ON goals (user_id);
CREATE INDEX idx_goals_category               ON goals (category_id);
CREATE INDEX idx_goals_project                ON goals (project_id);
CREATE INDEX idx_goals_group                  ON goals (group_id);

CREATE INDEX idx_goal_entries_user            ON goal_entries (user_id);
CREATE INDEX idx_goal_entries_category        ON goal_entries (category_id);
CREATE INDEX idx_goal_entries_date            ON goal_entries (date);

CREATE INDEX idx_user_questions_user          ON user_questions (user_id);

CREATE INDEX idx_daily_answers_user           ON daily_answers (user_id);
CREATE INDEX idx_daily_answers_question       ON daily_answers (user_question_id);
CREATE INDEX idx_daily_answers_date           ON daily_answers (date);
-- Natural key: one live answer per question per day.
CREATE UNIQUE INDEX idx_daily_answers_uniq    ON daily_answers (user_question_id, date) WHERE deleted_at IS NULL;

CREATE INDEX idx_moon_snapshots_user          ON moon_snapshots (user_id);
CREATE INDEX idx_moon_snapshots_date          ON moon_snapshots (date);

CREATE INDEX idx_reminders_user               ON reminders (user_id);
CREATE INDEX idx_reminders_status             ON reminders (status);
CREATE INDEX idx_reminders_linked             ON reminders (linked_to_type, linked_to_id);

CREATE INDEX idx_reminder_occurrences_user    ON reminder_occurrences (user_id);
CREATE INDEX idx_reminder_occurrences_reminder ON reminder_occurrences (reminder_id);

CREATE INDEX idx_user_preferences_user        ON user_preferences (user_id);

CREATE INDEX idx_user_quotes_user             ON user_quotes (user_id);
-- Unique guard for the idempotent system-quote seed (migration 0013).
CREATE UNIQUE INDEX idx_quotes_text_uniq      ON quotes (text);

-- ============================================================
-- End of schema
-- ============================================================
