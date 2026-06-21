-- ════════════════════════════════════════════════════════════════
-- Simplicity — schema.sql  (REGENERATED from the live EU DB by
-- introspection; the Docker-based `supabase db dump` is unavailable here).
-- public schema only — auth.* / storage.* are Supabase-managed.
-- ════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Functions
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Event-trigger function: invoked only by the DDL-event machinery, never called
-- directly. Revoke EXECUTE from clients (Security Advisor hardening, migration 0045).
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ════════════════════════════════════ Tables ════════════════════════════════════
CREATE TABLE calendar_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  google_event_id text NOT NULL,
  client_id uuid,
  title text,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  all_day boolean DEFAULT false NOT NULL,
  duration_minutes integer,
  confidence_score real,
  matched_manually boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  project_id uuid,
  lead_id uuid,
  group_id uuid,
  owned boolean DEFAULT false NOT NULL
);

CREATE TABLE categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE client_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE client_status_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE client_statuses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  meta_category text NOT NULL,
  display_name text NOT NULL,
  icon text,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  status_id uuid,
  status_meta text NOT NULL,
  project_id uuid,
  group_id uuid,
  sessions integer DEFAULT 0 NOT NULL,
  price_per_session numeric DEFAULT 0 NOT NULL,
  total_override numeric,
  has_custom_price boolean DEFAULT false NOT NULL,
  recurring_day smallint,
  recurring_time text,
  left_mid_process boolean DEFAULT false NOT NULL,
  phone text,
  notes text,
  notes_updated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  recurring_end_time text,
  recurring_start_date date,
  recurring_end_date date,
  balance_adjustment numeric DEFAULT 0 NOT NULL,
  sessions_done_adjustment integer DEFAULT 0 NOT NULL,
  paid_adjustment numeric DEFAULT 0 NOT NULL,
  billing_mode text DEFAULT 'package'::text NOT NULL,
  email text
);

CREATE TABLE daily_answers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  user_question_id uuid NOT NULL,
  date date NOT NULL,
  value_num numeric,
  value_text text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  type text,
  status text DEFAULT 'new'::text NOT NULL
);

CREATE TABLE goal_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  key text,
  name text NOT NULL,
  icon text,
  color text,
  measurement_type text NOT NULL,
  data_source text,
  graph_type text NOT NULL,
  builtin boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE goal_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  category_id uuid NOT NULL,
  project_id uuid,
  group_id uuid,
  date date NOT NULL,
  value numeric NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE goals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  category_id uuid NOT NULL,
  parent_goal_id uuid,
  project_id uuid,
  group_id uuid,
  label text,
  time_frame text NOT NULL,
  target_value numeric NOT NULL,
  target_date date,
  importance integer NOT NULL,
  tracking_method text DEFAULT 'manual'::text NOT NULL,
  tracked_by_question_id uuid,
  measurement_type text,
  data_source text,
  manual_input_type text,
  schedule_pattern jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE group_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  client_id uuid NOT NULL,
  joined_at timestamp with time zone NOT NULL,
  left_at timestamp with time zone,
  total_override numeric,
  has_custom_price boolean DEFAULT false NOT NULL,
  package_sessions_override integer,
  left_mid_process boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  package_price numeric,
  package_sessions integer,
  recurring_day smallint,
  recurring_time text,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  price_per_session numeric,
  billing_mode text DEFAULT 'package'::text NOT NULL,
  recurring_end_time text,
  recurring_start_date date,
  recurring_end_date date
);

CREATE TABLE lead_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE lead_status_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_status_id uuid,
  to_status_id uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL,
  source text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE lead_statuses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  meta_category text NOT NULL,
  display_name text NOT NULL,
  color text,
  icon text,
  is_default boolean DEFAULT false NOT NULL,
  legacy_key text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  source_id uuid,
  status text DEFAULT 'new'::text NOT NULL,
  status_id uuid,
  status_meta text DEFAULT 'in_process'::text NOT NULL,
  inquiry_date date,
  follow_up_date date,
  last_status_changed_at timestamp with time zone,
  notes text,
  converted_to_client_id uuid,
  converted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  closed_at timestamp with time zone,
  project_id uuid,
  group_id uuid,
  page_id uuid,
  email text,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  pending_review boolean DEFAULT false NOT NULL
);

CREATE TABLE lead_pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text DEFAULT ''::text NOT NULL,
  published boolean DEFAULT false NOT NULL,
  auto_approve boolean DEFAULT false NOT NULL,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  project_id uuid,
  slug text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE moon_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  date date NOT NULL,
  score numeric NOT NULL,
  paced numeric,
  confidence numeric,
  breakdown jsonb,
  reflection text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE quotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  text text NOT NULL,
  author text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  category text
);

CREATE TABLE recurring_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  desc text,
  project_id uuid,
  client_id uuid,
  category_id uuid,
  cadence_type text DEFAULT 'monthly_date'::text NOT NULL,
  day_of_month integer,
  day_of_week smallint,
  until_date date,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  trigger_type text DEFAULT 'schedule'::text NOT NULL
);

CREATE TABLE reminder_occurrences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  reminder_id uuid NOT NULL,
  occurrence_date text NOT NULL,
  status text NOT NULL,
  completed_at timestamp with time zone,
  date_override timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  scheduled_at timestamp with time zone NOT NULL,
  recurrence_type text DEFAULT 'none'::text NOT NULL,
  recurrence_pattern jsonb,
  end_date date,
  linked_to_type text,
  linked_to_id text,
  status text DEFAULT 'pending'::text NOT NULL,
  type text,
  channel text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE scheduled_meetings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  scheduled_at timestamp with time zone NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  session_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE session_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  name text NOT NULL,
  mime text NOT NULL,
  size integer,
  url text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  client_id uuid,
  group_id uuid,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  date timestamp with time zone NOT NULL,
  notes text,
  summary text,
  num integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE task_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE task_statuses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  meta_category text NOT NULL,
  display_name text NOT NULL,
  icon text,
  color text,
  is_default boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  priority text NOT NULL,
  status text DEFAULT 'todo'::text NOT NULL,
  project_id uuid,
  client_id uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  status_id uuid,
  category_id uuid
);

CREATE TABLE transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  desc text,
  date date NOT NULL,
  status text DEFAULT 'confirmed'::text NOT NULL,
  project_id uuid,
  client_id uuid,
  category_id uuid,
  recurring_id uuid,
  orphaned_from jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE user_integrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  provider text DEFAULT 'google_calendar'::text NOT NULL,
  access_token text,
  refresh_token text,
  token_expiry timestamp with time zone,
  sync_from date,
  sync_token text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE user_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE user_questions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  template_key text,
  custom_text text,
  scale_type text NOT NULL,
  icon text,
  active boolean DEFAULT true NOT NULL,
  order integer DEFAULT 0 NOT NULL,
  schedule_pattern jsonb DEFAULT '{"type": "days_of_week", "values": [0, 1, 2, 3, 4, 5, 6]}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

CREATE TABLE user_quotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  text text NOT NULL,
  author text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);

-- ════════════════════════════════════ Constraints ════════════════════════════════════
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_user_event_uniq UNIQUE (user_id, google_event_id);
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE categories ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE client_notes ADD CONSTRAINT client_notes_pkey PRIMARY KEY (id);
ALTER TABLE client_notes ADD CONSTRAINT client_notes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE client_notes ADD CONSTRAINT client_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE client_status_log ADD CONSTRAINT client_status_log_pkey PRIMARY KEY (id);
ALTER TABLE client_status_log ADD CONSTRAINT client_status_log_new_status_check CHECK ((new_status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE client_status_log ADD CONSTRAINT client_status_log_old_status_check CHECK ((old_status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE client_status_log ADD CONSTRAINT client_status_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE client_status_log ADD CONSTRAINT client_status_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE client_statuses ADD CONSTRAINT client_statuses_pkey PRIMARY KEY (id);
ALTER TABLE client_statuses ADD CONSTRAINT client_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE client_statuses ADD CONSTRAINT client_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE clients ADD CONSTRAINT clients_billing_mode_check CHECK ((billing_mode = ANY (ARRAY['package'::text, 'per_session'::text])));
ALTER TABLE clients ADD CONSTRAINT clients_recurring_day_check CHECK (((recurring_day >= 0) AND (recurring_day <= 6)));
ALTER TABLE clients ADD CONSTRAINT clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE clients ADD CONSTRAINT clients_status_meta_check CHECK ((status_meta = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE clients ADD CONSTRAINT clients_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE clients ADD CONSTRAINT clients_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE clients ADD CONSTRAINT clients_status_id_fkey FOREIGN KEY (status_id) REFERENCES client_statuses(id) ON DELETE SET NULL;
ALTER TABLE clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE daily_answers ADD CONSTRAINT daily_answers_pkey PRIMARY KEY (id);
ALTER TABLE daily_answers ADD CONSTRAINT daily_answers_value_xor CHECK ((((value_num IS NOT NULL) AND (value_text IS NULL)) OR ((value_num IS NULL) AND (value_text IS NOT NULL))));
ALTER TABLE daily_answers ADD CONSTRAINT daily_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE daily_answers ADD CONSTRAINT daily_answers_user_question_id_fkey FOREIGN KEY (user_question_id) REFERENCES user_questions(id) ON DELETE CASCADE;
ALTER TABLE feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE feedback ADD CONSTRAINT feedback_message_check CHECK ((char_length(btrim(message)) > 0));
ALTER TABLE feedback ADD CONSTRAINT feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'done'::text])));
ALTER TABLE feedback ADD CONSTRAINT feedback_type_check CHECK (((type IS NULL) OR (type = ANY (ARRAY['bug'::text, 'idea'::text, 'praise'::text, 'other'::text]))));
ALTER TABLE feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE goal_categories ADD CONSTRAINT goal_categories_pkey PRIMARY KEY (id);
ALTER TABLE goal_categories ADD CONSTRAINT goal_categories_graph_type_check CHECK ((graph_type = ANY (ARRAY['cumulative'::text, 'delta'::text])));
ALTER TABLE goal_categories ADD CONSTRAINT goal_categories_measurement_type_check CHECK ((measurement_type = ANY (ARRAY['auto'::text, 'manual'::text])));
ALTER TABLE goal_categories ADD CONSTRAINT goal_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE goal_entries ADD CONSTRAINT goal_entries_pkey PRIMARY KEY (id);
ALTER TABLE goal_entries ADD CONSTRAINT goal_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES goal_categories(id) ON DELETE CASCADE;
ALTER TABLE goal_entries ADD CONSTRAINT goal_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE goal_entries ADD CONSTRAINT goal_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE goal_entries ADD CONSTRAINT goal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE goals ADD CONSTRAINT goals_pkey PRIMARY KEY (id);
ALTER TABLE goals ADD CONSTRAINT goals_importance_check CHECK (((importance >= 1) AND (importance <= 5)));
ALTER TABLE goals ADD CONSTRAINT goals_manual_input_type_check CHECK ((manual_input_type = ANY (ARRAY['number'::text, 'slider'::text, 'yes_no'::text])));
ALTER TABLE goals ADD CONSTRAINT goals_measurement_type_check CHECK ((measurement_type = ANY (ARRAY['auto'::text, 'manual'::text])));
ALTER TABLE goals ADD CONSTRAINT goals_time_frame_check CHECK ((time_frame = ANY (ARRAY['deadline'::text, 'monthly'::text, 'weekly'::text])));
ALTER TABLE goals ADD CONSTRAINT goals_tracking_method_check CHECK ((tracking_method = ANY (ARRAY['manual'::text, 'daily_question'::text])));
ALTER TABLE goals ADD CONSTRAINT goals_category_id_fkey FOREIGN KEY (category_id) REFERENCES goal_categories(id) ON DELETE CASCADE;
ALTER TABLE goals ADD CONSTRAINT goals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE goals ADD CONSTRAINT goals_parent_goal_id_fkey FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE CASCADE;
ALTER TABLE goals ADD CONSTRAINT goals_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE goals ADD CONSTRAINT goals_tracked_by_question_id_fkey FOREIGN KEY (tracked_by_question_id) REFERENCES user_questions(id) ON DELETE SET NULL;
ALTER TABLE goals ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);
ALTER TABLE group_members ADD CONSTRAINT group_members_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE groups ADD CONSTRAINT groups_billing_mode_check CHECK ((billing_mode = ANY (ARRAY['package'::text, 'per_session'::text, 'none'::text])));
ALTER TABLE groups ADD CONSTRAINT groups_recurring_day_check CHECK (((recurring_day >= 0) AND (recurring_day <= 6)));
ALTER TABLE groups ADD CONSTRAINT groups_status_check CHECK ((status = ANY (ARRAY['active'::text, 'in_development'::text, 'ended'::text])));
ALTER TABLE groups ADD CONSTRAINT groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE groups ADD CONSTRAINT groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE lead_sources ADD CONSTRAINT lead_sources_pkey PRIMARY KEY (id);
ALTER TABLE lead_sources ADD CONSTRAINT lead_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE lead_status_log ADD CONSTRAINT lead_status_log_pkey PRIMARY KEY (id);
ALTER TABLE lead_status_log ADD CONSTRAINT lead_status_log_source_check CHECK ((source = ANY (ARRAY['manual_drag'::text, 'manual_select'::text, 'converted'::text, 'auto_expire'::text])));
ALTER TABLE lead_status_log ADD CONSTRAINT lead_status_log_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES lead_statuses(id) ON DELETE SET NULL;
ALTER TABLE lead_status_log ADD CONSTRAINT lead_status_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE lead_status_log ADD CONSTRAINT lead_status_log_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES lead_statuses(id) ON DELETE CASCADE;
ALTER TABLE lead_status_log ADD CONSTRAINT lead_status_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE lead_statuses ADD CONSTRAINT lead_statuses_pkey PRIMARY KEY (id);
ALTER TABLE lead_statuses ADD CONSTRAINT lead_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['in_process'::text, 'converted'::text, 'not_relevant'::text])));
ALTER TABLE lead_statuses ADD CONSTRAINT lead_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE lead_pages ADD CONSTRAINT lead_pages_pkey PRIMARY KEY (id);
ALTER TABLE lead_pages ADD CONSTRAINT lead_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE lead_pages ADD CONSTRAINT lead_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE lead_pages ADD CONSTRAINT lead_pages_slug_format CHECK ((slug IS NULL OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));
ALTER TABLE leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_contact'::text, 'intro_call'::text, 'pending_decision'::text, 'closed'::text])));
ALTER TABLE leads ADD CONSTRAINT leads_status_meta_check CHECK ((status_meta = ANY (ARRAY['in_process'::text, 'converted'::text, 'not_relevant'::text])));
ALTER TABLE leads ADD CONSTRAINT leads_converted_to_client_id_fkey FOREIGN KEY (converted_to_client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE leads ADD CONSTRAINT leads_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE leads ADD CONSTRAINT leads_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE leads ADD CONSTRAINT leads_source_id_fkey FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL;
ALTER TABLE leads ADD CONSTRAINT leads_status_id_fkey FOREIGN KEY (status_id) REFERENCES lead_statuses(id) ON DELETE SET NULL;
ALTER TABLE leads ADD CONSTRAINT leads_page_id_fkey FOREIGN KEY (page_id) REFERENCES lead_pages(id) ON DELETE SET NULL;
ALTER TABLE leads ADD CONSTRAINT leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE moon_snapshots ADD CONSTRAINT moon_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE moon_snapshots ADD CONSTRAINT moon_snapshots_user_date_uniq UNIQUE (user_id, date);
ALTER TABLE moon_snapshots ADD CONSTRAINT moon_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE quotes ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_pkey PRIMARY KEY (id);
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_cadence_type_check CHECK ((cadence_type = ANY (ARRAY['monthly_date'::text, 'weekly'::text])));
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 31)));
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['schedule'::text, 'on_meeting'::text])));
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE recurring_templates ADD CONSTRAINT recurring_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE reminder_occurrences ADD CONSTRAINT reminder_occurrences_pkey PRIMARY KEY (id);
ALTER TABLE reminder_occurrences ADD CONSTRAINT reminder_occurrences_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'skipped'::text, 'rescheduled'::text])));
ALTER TABLE reminder_occurrences ADD CONSTRAINT reminder_occurrences_reminder_id_fkey FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE;
ALTER TABLE reminder_occurrences ADD CONSTRAINT reminder_occurrences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE reminders ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);
ALTER TABLE reminders ADD CONSTRAINT reminders_linked_to_type_check CHECK ((linked_to_type = ANY (ARRAY['client'::text, 'project'::text, 'group'::text, 'task'::text, 'transaction'::text, 'lead'::text, 'period'::text])));
ALTER TABLE reminders ADD CONSTRAINT reminders_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['none'::text, 'weekly'::text, 'monthly_date'::text, 'every_x_days'::text])));
ALTER TABLE reminders ADD CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'triggered'::text, 'completed'::text, 'dismissed'::text, 'snoozed'::text])));
ALTER TABLE reminders ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE scheduled_meetings ADD CONSTRAINT scheduled_meetings_pkey PRIMARY KEY (id);
ALTER TABLE scheduled_meetings ADD CONSTRAINT scheduled_meetings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'skipped'::text, 'expired'::text])));
ALTER TABLE scheduled_meetings ADD CONSTRAINT scheduled_meetings_subject_type_check CHECK ((subject_type = ANY (ARRAY['client'::text, 'group'::text])));
ALTER TABLE scheduled_meetings ADD CONSTRAINT scheduled_meetings_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE scheduled_meetings ADD CONSTRAINT scheduled_meetings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE session_attachments ADD CONSTRAINT session_attachments_pkey PRIMARY KEY (id);
ALTER TABLE session_attachments ADD CONSTRAINT session_attachments_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE session_attachments ADD CONSTRAINT session_attachments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE sessions ADD CONSTRAINT sessions_subject_type_check CHECK ((subject_type = ANY (ARRAY['client'::text, 'group'::text])));
ALTER TABLE sessions ADD CONSTRAINT sessions_subject_xor CHECK ((((client_id IS NOT NULL) AND (group_id IS NULL)) OR ((client_id IS NULL) AND (group_id IS NOT NULL))));
ALTER TABLE sessions ADD CONSTRAINT sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD CONSTRAINT sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE task_categories ADD CONSTRAINT task_categories_pkey PRIMARY KEY (id);
ALTER TABLE task_categories ADD CONSTRAINT task_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE task_statuses ADD CONSTRAINT task_statuses_pkey PRIMARY KEY (id);
ALTER TABLE task_statuses ADD CONSTRAINT task_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['open'::text, 'done'::text])));
ALTER TABLE task_statuses ADD CONSTRAINT task_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])));
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'done'::text])));
ALTER TABLE tasks ADD CONSTRAINT tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_id_fkey FOREIGN KEY (status_id) REFERENCES task_statuses(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'pending'::text, 'skipped'::text])));
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
ALTER TABLE transactions ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_recurring_id_fkey FOREIGN KEY (recurring_id) REFERENCES recurring_templates(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_pkey PRIMARY KEY (id);
ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_user_provider_uniq UNIQUE (user_id, provider);
ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_uniq UNIQUE (user_id);
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_questions ADD CONSTRAINT user_questions_pkey PRIMARY KEY (id);
ALTER TABLE user_questions ADD CONSTRAINT user_questions_scale_type_check CHECK ((scale_type = ANY (ARRAY['1-10'::text, 'yes_no'::text, 'free_text'::text])));
ALTER TABLE user_questions ADD CONSTRAINT user_questions_source_chk CHECK (((template_key IS NOT NULL) OR (custom_text IS NOT NULL)));
ALTER TABLE user_questions ADD CONSTRAINT user_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_quotes ADD CONSTRAINT user_quotes_pkey PRIMARY KEY (id);
ALTER TABLE user_quotes ADD CONSTRAINT user_quotes_text_check CHECK ((char_length(btrim(text)) > 0));
ALTER TABLE user_quotes ADD CONSTRAINT user_quotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ════════════════════════════════════ Indexes ════════════════════════════════════
CREATE INDEX idx_calendar_events_client ON public.calendar_events USING btree (client_id);
CREATE INDEX idx_calendar_events_group ON public.calendar_events USING btree (group_id);
CREATE INDEX idx_calendar_events_lead ON public.calendar_events USING btree (lead_id);
CREATE INDEX idx_calendar_events_project ON public.calendar_events USING btree (project_id);
CREATE INDEX idx_calendar_events_start ON public.calendar_events USING btree (start_time);
CREATE INDEX idx_calendar_events_user ON public.calendar_events USING btree (user_id);
CREATE INDEX idx_categories_user ON public.categories USING btree (user_id);
CREATE INDEX idx_client_notes_client ON public.client_notes USING btree (client_id);
CREATE INDEX idx_client_notes_user ON public.client_notes USING btree (user_id);
CREATE INDEX idx_client_status_log_client ON public.client_status_log USING btree (client_id);
CREATE INDEX idx_client_status_log_user ON public.client_status_log USING btree (user_id);
CREATE INDEX idx_client_status_log_user_changed ON public.client_status_log USING btree (user_id, changed_at);
CREATE INDEX idx_client_statuses_user ON public.client_statuses USING btree (user_id);
CREATE INDEX idx_clients_group ON public.clients USING btree (group_id);
CREATE INDEX idx_clients_project ON public.clients USING btree (project_id);
CREATE INDEX idx_clients_status ON public.clients USING btree (status);
CREATE INDEX idx_clients_status_id ON public.clients USING btree (status_id);
CREATE INDEX idx_clients_user ON public.clients USING btree (user_id);
CREATE INDEX idx_daily_answers_date ON public.daily_answers USING btree (date);
CREATE INDEX idx_daily_answers_question ON public.daily_answers USING btree (user_question_id);
CREATE UNIQUE INDEX idx_daily_answers_uniq ON public.daily_answers USING btree (user_question_id, date) WHERE (deleted_at IS NULL);
CREATE INDEX idx_daily_answers_user ON public.daily_answers USING btree (user_id);
CREATE INDEX idx_feedback_created_at ON public.feedback USING btree (created_at DESC);
CREATE INDEX idx_feedback_status ON public.feedback USING btree (status);
CREATE INDEX idx_feedback_user ON public.feedback USING btree (user_id);
CREATE INDEX idx_goal_categories_user ON public.goal_categories USING btree (user_id);
CREATE INDEX idx_goal_entries_category ON public.goal_entries USING btree (category_id);
CREATE INDEX idx_goal_entries_date ON public.goal_entries USING btree (date);
CREATE INDEX idx_goal_entries_group ON public.goal_entries USING btree (group_id);
CREATE INDEX idx_goal_entries_project ON public.goal_entries USING btree (project_id);
CREATE INDEX idx_goal_entries_user ON public.goal_entries USING btree (user_id);
CREATE INDEX idx_goals_category ON public.goals USING btree (category_id);
CREATE INDEX idx_goals_group ON public.goals USING btree (group_id);
CREATE INDEX idx_goals_project ON public.goals USING btree (project_id);
CREATE INDEX idx_goals_tracked_question ON public.goals USING btree (tracked_by_question_id);
CREATE INDEX idx_goals_user ON public.goals USING btree (user_id);
CREATE INDEX idx_group_members_client ON public.group_members USING btree (client_id);
CREATE INDEX idx_group_members_group ON public.group_members USING btree (group_id);
CREATE INDEX idx_group_members_user ON public.group_members USING btree (user_id);
CREATE INDEX idx_groups_project ON public.groups USING btree (project_id);
CREATE INDEX idx_groups_status ON public.groups USING btree (status);
CREATE INDEX idx_groups_user ON public.groups USING btree (user_id);
CREATE INDEX idx_lead_sources_user ON public.lead_sources USING btree (user_id);
CREATE INDEX idx_lead_status_log_from ON public.lead_status_log USING btree (from_status_id);
CREATE INDEX idx_lead_status_log_lead ON public.lead_status_log USING btree (lead_id);
CREATE INDEX idx_lead_status_log_to ON public.lead_status_log USING btree (to_status_id);
CREATE INDEX idx_lead_status_log_user ON public.lead_status_log USING btree (user_id);
CREATE INDEX idx_lead_status_log_user_changed ON public.lead_status_log USING btree (user_id, changed_at);
CREATE INDEX idx_lead_statuses_user ON public.lead_statuses USING btree (user_id);
CREATE INDEX idx_lead_pages_user ON public.lead_pages USING btree (user_id);
CREATE INDEX idx_lead_pages_project ON public.lead_pages USING btree (project_id);
CREATE UNIQUE INDEX idx_lead_pages_slug_unique ON public.lead_pages USING btree (lower(slug)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_leads_converted ON public.leads USING btree (converted_to_client_id);
CREATE INDEX idx_leads_page ON public.leads USING btree (page_id);
CREATE INDEX idx_leads_pending_review ON public.leads USING btree (user_id) WHERE pending_review;
CREATE INDEX idx_leads_group ON public.leads USING btree (group_id);
CREATE INDEX idx_leads_project ON public.leads USING btree (project_id);
CREATE INDEX idx_leads_source ON public.leads USING btree (source_id);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX idx_leads_status_id ON public.leads USING btree (status_id);
CREATE INDEX idx_leads_status_meta ON public.leads USING btree (status_meta);
CREATE INDEX idx_leads_user ON public.leads USING btree (user_id);
CREATE INDEX idx_moon_snapshots_date ON public.moon_snapshots USING btree (date);
CREATE INDEX idx_moon_snapshots_user ON public.moon_snapshots USING btree (user_id);
CREATE INDEX idx_projects_user ON public.projects USING btree (user_id);
CREATE UNIQUE INDEX idx_quotes_text_uniq ON public.quotes USING btree (text);
CREATE INDEX idx_recurring_templates_category ON public.recurring_templates USING btree (category_id);
CREATE INDEX idx_recurring_templates_client ON public.recurring_templates USING btree (client_id);
CREATE INDEX idx_recurring_templates_project ON public.recurring_templates USING btree (project_id);
CREATE INDEX idx_recurring_templates_user ON public.recurring_templates USING btree (user_id);
CREATE INDEX idx_reminder_occurrences_reminder ON public.reminder_occurrences USING btree (reminder_id);
CREATE INDEX idx_reminder_occurrences_user ON public.reminder_occurrences USING btree (user_id);
CREATE INDEX idx_reminders_linked ON public.reminders USING btree (linked_to_type, linked_to_id);
CREATE INDEX idx_reminders_status ON public.reminders USING btree (status);
CREATE INDEX idx_reminders_user ON public.reminders USING btree (user_id);
CREATE INDEX idx_scheduled_meetings_session ON public.scheduled_meetings USING btree (session_id);
CREATE INDEX idx_scheduled_meetings_status ON public.scheduled_meetings USING btree (status);
CREATE INDEX idx_scheduled_meetings_subject ON public.scheduled_meetings USING btree (subject_type, subject_id);
CREATE INDEX idx_scheduled_meetings_user ON public.scheduled_meetings USING btree (user_id);
CREATE UNIQUE INDEX scheduled_meetings_no_dup ON public.scheduled_meetings USING btree (user_id, subject_type, subject_id, scheduled_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_session_attachments_session ON public.session_attachments USING btree (session_id);
CREATE INDEX idx_session_attachments_user ON public.session_attachments USING btree (user_id);
CREATE INDEX idx_sessions_client ON public.sessions USING btree (client_id);
CREATE INDEX idx_sessions_date ON public.sessions USING btree (date);
CREATE INDEX idx_sessions_group ON public.sessions USING btree (group_id);
CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);
CREATE INDEX idx_task_categories_user ON public.task_categories USING btree (user_id);
CREATE INDEX idx_task_statuses_user ON public.task_statuses USING btree (user_id);
CREATE INDEX idx_tasks_category_id ON public.tasks USING btree (category_id);
CREATE INDEX idx_tasks_client ON public.tasks USING btree (client_id);
CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);
CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX idx_tasks_status_id ON public.tasks USING btree (status_id);
CREATE INDEX idx_tasks_user ON public.tasks USING btree (user_id);
CREATE INDEX idx_transactions_category ON public.transactions USING btree (category_id);
CREATE INDEX idx_transactions_client ON public.transactions USING btree (client_id);
CREATE INDEX idx_transactions_date ON public.transactions USING btree (date);
CREATE INDEX idx_transactions_project ON public.transactions USING btree (project_id);
CREATE INDEX idx_transactions_recurring ON public.transactions USING btree (recurring_id);
CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);
CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);
CREATE INDEX idx_user_integrations_user ON public.user_integrations USING btree (user_id);
CREATE INDEX idx_user_preferences_user ON public.user_preferences USING btree (user_id);
CREATE INDEX idx_user_questions_user ON public.user_questions USING btree (user_id);
CREATE INDEX idx_user_quotes_user ON public.user_quotes USING btree (user_id);

-- ════════════════════════════════════ Row Level Security ════════════════════════════════════
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE moon_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_own ON calendar_events FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY categories_own ON categories FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY client_notes_own ON client_notes FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY client_status_log_insert ON client_status_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY client_status_log_select ON client_status_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY client_statuses_own ON client_statuses FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY clients_own ON clients FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY daily_answers_own ON daily_answers FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY feedback_insert ON feedback FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY feedback_select ON feedback FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY goal_categories_own ON goal_categories FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY goal_entries_own ON goal_entries FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY goals_own ON goals FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY group_members_own ON group_members FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY groups_own ON groups FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_sources_own ON lead_sources FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_status_log_insert ON lead_status_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_status_log_select ON lead_status_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY lead_statuses_own ON lead_statuses FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_pages_own ON lead_pages FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY leads_own ON leads FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY moon_snapshots_own ON moon_snapshots FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY projects_own ON projects FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY quotes_select ON quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY recurring_templates_own ON recurring_templates FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY reminder_occurrences_own ON reminder_occurrences FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY reminders_own ON reminders FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY scheduled_meetings_own ON scheduled_meetings FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY session_attachments_own ON session_attachments FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY sessions_own ON sessions FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY task_categories_own ON task_categories FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY task_statuses_own ON task_statuses FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY tasks_own ON tasks FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY transactions_own ON transactions FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY user_preferences_own ON user_preferences FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY user_questions_own ON user_questions FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY user_quotes_own ON user_quotes FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- ════════════════════════════════════ Triggers ════════════════════════════════════
CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_notes_updated BEFORE UPDATE ON public.client_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_statuses_updated BEFORE UPDATE ON public.client_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_daily_answers_updated BEFORE UPDATE ON public.daily_answers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goal_categories_updated BEFORE UPDATE ON public.goal_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goal_entries_updated BEFORE UPDATE ON public.goal_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_group_members_updated BEFORE UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_sources_updated BEFORE UPDATE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_statuses_updated BEFORE UPDATE ON public.lead_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_pages_updated BEFORE UPDATE ON public.lead_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_moon_snapshots_updated BEFORE UPDATE ON public.moon_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recurring_templates_updated BEFORE UPDATE ON public.recurring_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reminder_occurrences_updated BEFORE UPDATE ON public.reminder_occurrences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reminders_updated BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scheduled_meetings_updated BEFORE UPDATE ON public.scheduled_meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_session_attachments_updated BEFORE UPDATE ON public.session_attachments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_task_categories_updated BEFORE UPDATE ON public.task_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_task_statuses_updated BEFORE UPDATE ON public.task_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_integrations_updated BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_preferences_updated BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_questions_updated BEFORE UPDATE ON public.user_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_quotes_updated BEFORE UPDATE ON public.user_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════ Invoice integration (migrations 0033–0037) ════════════════════════════════════
-- Resynced 2026-06-14. Per-user BYOK invoice credentials on user_integrations
-- (service-role only — no authenticated policy). Document links on transactions,
-- and a Route-B staging table. Written as additive ALTERs for clarity.
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS api_key text;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS api_secret text;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS environment text;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS auto_import boolean DEFAULT true NOT NULL; -- income-import switch; ON by default (0040)
ALTER TABLE user_integrations ALTER COLUMN auto_import SET DEFAULT true; -- 0040 (in case the column predates the new default)
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS webhook_token text;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS last_polled_at timestamp with time zone;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS credentials_invalid_at timestamp with time zone; -- 0038: durable "credentials rejected" marker
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_integrations_environment_check') THEN
  ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_environment_check CHECK (environment IS NULL OR environment IN ('sandbox', 'production'));
END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_integrations_webhook_token ON public.user_integrations (webhook_token) WHERE webhook_token IS NOT NULL;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_provider text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_document_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_document_number text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_document_type text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_document_url text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_synced_at timestamp with time zone;
-- 0039: credit notes (זיכוי) — invoice_credited_at doubles as the "out of totals" flag.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_credited_at timestamp with time zone;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_credit_document_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_credit_document_number text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS invoice_credit_document_url text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_invoice_doc_uniq ON public.transactions (user_id, invoice_provider, invoice_document_id) WHERE invoice_document_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS pending_invoice_imports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  external_document_id text NOT NULL,
  document_type text,
  document_number text,
  amount numeric,
  currency text DEFAULT 'ILS'::text,
  doc_date date,
  customer_name text,
  document_url text,
  client_id uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  created_transaction_id uuid,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_invoice_imports_pkey') THEN
    ALTER TABLE pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_pkey PRIMARY KEY (id);
    ALTER TABLE pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_status_check CHECK (status = ANY (ARRAY['pending'::text, 'imported'::text, 'dismissed'::text]));
    ALTER TABLE pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_uniq UNIQUE (user_id, provider, external_document_id);
    ALTER TABLE pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    ALTER TABLE pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
    ALTER TABLE pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_created_transaction_id_fkey FOREIGN KEY (created_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pending_invoice_imports_user ON public.pending_invoice_imports (user_id);
CREATE INDEX IF NOT EXISTS idx_pending_invoice_imports_status ON public.pending_invoice_imports (status);
ALTER TABLE pending_invoice_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pending_invoice_imports_select ON pending_invoice_imports;
CREATE POLICY pending_invoice_imports_select ON pending_invoice_imports FOR SELECT TO authenticated USING ((user_id = auth.uid()));
DROP TRIGGER IF EXISTS trg_pending_invoice_imports_updated ON public.pending_invoice_imports;
CREATE TRIGGER trg_pending_invoice_imports_updated BEFORE UPDATE ON public.pending_invoice_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
