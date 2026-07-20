-- ════════════════════════════════════════════════════════════════
-- Simplicity — schema.sql
--
-- WATERMARK: regenerated 2026-07-20 from the live EU database, with
-- migrations applied through 0096. Read pg_catalog via
-- `supabase/introspect-schema.sql`, so this is what is ACTUALLY there —
-- not a replay of the migration files.
--
-- Regenerate after any batch of migrations, with that same file, and move
-- the watermark. This document goes stale silently — nothing fails when it
-- is wrong — which is how the previous version fell ~70 migrations behind:
-- it declared 35 tables, three of which migration 0027 had dropped
-- (client_notes, reminder_occurrences, session_attachments), and omitted 22
-- that exist.
--
-- Counts here are diffed against the introspection output, not eyeballed.
-- The first draft of this header said "36 tables" because the number was
-- written from memory instead of counted — in a file whose only job is to
-- be accurate, that is the failure mode to guard against.
--
-- 54 tables, verified against the live list rather than counted by eye.
-- public schema only; auth.* / storage.* are Supabase-managed.
-- Constraints, indexes and triggers are reproduced as Postgres itself
-- renders them (pg_get_constraintdef / pg_get_indexdef / pg_get_triggerdef).
--
-- ── RESTRICTIVE POLICIES ARE LOAD-BEARING HERE — verified 2026-07-20 ──
-- Several tables carry more than one policy for the same command. Postgres
-- combines PERMISSIVE policies with OR and RESTRICTIVE ones with AND, so
-- which flavour each is determines whether it constrains anything at all.
-- Checked against the live DB; the split is deliberate and correct:
--
--   PERMISSIVE  (grants access)   *_own, *_select_members, *_insert_own,
--                                 *_update_own, *_admin_moderate
--   RESTRICTIVE (narrows it)      clients_tier_limit, projects_tier_limit,
--                                 goals_tier_limit, booking_pages_tier_gate,
--                                 site_pages_tier_gate,
--                                 community_messages_insert_live,
--                                 community_profiles_name_not_reserved,
--                                 community_profiles_unverified_insert
--
-- So a client INSERT evaluates as (user_id = auth.uid()) AND (tier check) —
-- the free-tier caps really do bind once BILLING_ENABLED flips on — and a
-- community message as (author AND member) AND (not-deleted), which is what
-- stops an insert carrying somebody else's user_id.
--
-- ⚠️ If any of the RESTRICTIVE ones is ever dropped and recreated without
-- `AS RESTRICTIVE`, it silently becomes an OR branch and stops constraining
-- anything: every tier cap evaporates, and community_messages would accept a
-- forged user_id. Nothing fails, no test goes red, and the policy still
-- reads correctly in every listing that omits the `permissive` column —
-- including the introspection query that produced this file. Confirm with:
--   SELECT tablename, policyname, cmd, permissive FROM pg_policies
--   WHERE schemaname='public' ORDER BY tablename, cmd;
-- ════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "btree_gist";   -- bookings_no_overlap EXCLUDE

-- ════════════════════════════════════════════════════════════════
-- app_sessions — app-usage beacon behind admin analytics (0076)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.app_sessions (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_pkey PRIMARY KEY (id);
CREATE INDEX app_sessions_created_at_idx ON public.app_sessions USING btree (created_at);
CREATE INDEX app_sessions_user_id_idx ON public.app_sessions USING btree (user_id);
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_sessions_insert_own ON public.app_sessions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
-- NOTE: insert-only. Nothing grants SELECT to authenticated; admin analytics
-- read it through the service role.

-- ════════════════════════════════════════════════════════════════
-- booking_pages / bookings — public self-service booking (0052, 0054, 0059)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.booking_pages (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  title                  text NOT NULL DEFAULT ''::text,
  published              boolean NOT NULL DEFAULT false,
  auto_confirm           boolean NOT NULL DEFAULT false,
  slug                   text,
  content                jsonb NOT NULL DEFAULT '{}'::jsonb,
  availability           jsonb NOT NULL DEFAULT '{}'::jsonb,
  meeting_type_ids       jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_id             uuid,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at             timestamp with time zone,
  write_to_google        boolean NOT NULL DEFAULT false,
  invite_client          boolean NOT NULL DEFAULT false,
  meeting_type_durations jsonb NOT NULL DEFAULT '{}'::jsonb,
  require_payment        boolean NOT NULL DEFAULT false
);
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_slug_format CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));
CREATE INDEX idx_booking_pages_user ON public.booking_pages USING btree (user_id);
CREATE UNIQUE INDEX idx_booking_pages_slug_unique ON public.booking_pages USING btree (lower(slug)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
ALTER TABLE public.booking_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_pages_own ON public.booking_pages FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY booking_pages_tier_gate ON public.booking_pages FOR INSERT TO authenticated WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (booking_page_count() < 1)));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE TRIGGER trg_booking_pages_updated BEFORE UPDATE ON public.booking_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.bookings (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  page_id          uuid,
  user_id          uuid NOT NULL,
  meeting_type_id  uuid,
  name             text NOT NULL,
  phone            text,
  email            text,
  note             text,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at        timestamp with time zone NOT NULL,
  ends_at          timestamp with time zone NOT NULL,
  status           text NOT NULL DEFAULT 'pending'::text,
  lead_id          uuid,
  event_id         uuid,
  google_event_id  text,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  payment_status   text NOT NULL DEFAULT 'none'::text,
  payment_deadline timestamp with time zone
);
ALTER TABLE public.bookings ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_window_chk CHECK ((ends_at > starts_at));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_chk CHECK ((payment_status = ANY (ARRAY['none'::text, 'awaiting'::text, 'paid'::text])));
-- Anti-double-booking: no two live bookings may overlap for one user.
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE ((status = ANY (ARRAY['pending'::text, 'confirmed'::text])));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_page_id_fkey FOREIGN KEY (page_id) REFERENCES booking_pages(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_meeting_type_id_fkey FOREIGN KEY (meeting_type_id) REFERENCES meeting_types(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_event_id_fkey FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_bookings_user ON public.bookings USING btree (user_id);
CREATE INDEX idx_bookings_page ON public.bookings USING btree (page_id);
CREATE INDEX idx_bookings_user_starts ON public.bookings USING btree (user_id, starts_at);
CREATE INDEX idx_bookings_pending ON public.bookings USING btree (user_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_bookings_awaiting ON public.bookings USING btree (user_id, payment_deadline) WHERE ((status = 'pending'::text) AND (payment_status = 'awaiting'::text));
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_own ON public.bookings FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- calendar_events — mirrored Google events + their app associations
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.calendar_events (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  google_event_id  text NOT NULL,
  client_id        uuid,
  title            text,
  start_time       timestamp with time zone,
  end_time         timestamp with time zone,
  all_day          boolean NOT NULL DEFAULT false,
  duration_minutes integer,
  confidence_score real,
  matched_manually boolean NOT NULL DEFAULT false,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at       timestamp with time zone,
  project_id       uuid,
  lead_id          uuid,
  group_id         uuid,
  owned            boolean NOT NULL DEFAULT false
);
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_user_event_uniq UNIQUE (user_id, google_event_id);
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_calendar_events_client ON public.calendar_events USING btree (client_id);
CREATE INDEX idx_calendar_events_group ON public.calendar_events USING btree (group_id);
CREATE INDEX idx_calendar_events_lead ON public.calendar_events USING btree (lead_id);
CREATE INDEX idx_calendar_events_project ON public.calendar_events USING btree (project_id);
CREATE INDEX idx_calendar_events_start ON public.calendar_events USING btree (start_time);
CREATE INDEX idx_calendar_events_user ON public.calendar_events USING btree (user_id);
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_own ON public.calendar_events FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- categories — finance categories
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.categories (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  name       text NOT NULL,
  color      text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE public.categories ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_categories_user ON public.categories USING btree (user_id);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_own ON public.categories FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- client_adjustments — ledger explaining the manual adjustment scalars (0095, 0096)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.client_adjustments (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  client_id   uuid NOT NULL,
  kind        text NOT NULL,
  reason      text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  note        text,
  occurred_on date DEFAULT CURRENT_DATE,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  updated_at  timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at  timestamp with time zone
);
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_kind_check CHECK ((kind = ANY (ARRAY['paid'::text, 'balance'::text])));
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_reason_check CHECK ((reason = ANY (ARRAY['discount'::text, 'import_fix'::text, 'unrecorded_payment'::text, 'legacy'::text])));
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_kind_reason_check CHECK ((((reason = 'discount'::text) AND (kind = 'balance'::text)) OR ((reason = 'import_fix'::text) AND (kind = 'paid'::text)) OR ((reason = 'unrecorded_payment'::text) AND (kind = 'paid'::text)) OR (reason = 'legacy'::text)));
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX idx_client_adjustments_user ON public.client_adjustments USING btree (user_id);
CREATE INDEX idx_client_adjustments_client ON public.client_adjustments USING btree (client_id);
ALTER TABLE public.client_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_adjustments_own ON public.client_adjustments FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_client_adjustments_updated BEFORE UPDATE ON public.client_adjustments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE public.client_adjustments IS 'Ledger EXPLAINING clients.paid_adjustment / balance_adjustment. Those columns stay the source of truth for clientBalance(); every write updates the scalar and appends a row here. reason=legacy marks rows backfilled by migration 0095, whose original date and reason are unknown.';

-- ════════════════════════════════════════════════════════════════
-- client_status_log / client_statuses
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.client_status_log (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  client_id  uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_pkey PRIMARY KEY (id);
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_new_status_check CHECK ((new_status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_old_status_check CHECK ((old_status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_client_status_log_client ON public.client_status_log USING btree (client_id);
CREATE INDEX idx_client_status_log_user ON public.client_status_log USING btree (user_id);
CREATE INDEX idx_client_status_log_user_changed ON public.client_status_log USING btree (user_id, changed_at);
ALTER TABLE public.client_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_status_log_insert ON public.client_status_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY client_status_log_select ON public.client_status_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE TABLE public.client_statuses (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  meta_category text NOT NULL,
  display_name  text NOT NULL,
  icon          text,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at    timestamp with time zone
);
ALTER TABLE public.client_statuses ADD CONSTRAINT client_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.client_statuses ADD CONSTRAINT client_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE public.client_statuses ADD CONSTRAINT client_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_client_statuses_user ON public.client_statuses USING btree (user_id);
ALTER TABLE public.client_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_statuses_own ON public.client_statuses FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_client_statuses_updated BEFORE UPDATE ON public.client_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- clients
-- NOTE: status/status_meta still use the stored key 'wandering'. The UI
-- label was renamed to "בהפסקה" in 2026-07; the key is untouched.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.clients (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL,
  name                    text NOT NULL,
  status                  text NOT NULL,
  status_id               uuid,
  status_meta             text NOT NULL,
  project_id              uuid,
  group_id                uuid,
  sessions                integer NOT NULL DEFAULT 0,
  price_per_session       numeric NOT NULL DEFAULT 0,
  total_override          numeric,
  has_custom_price        boolean NOT NULL DEFAULT false,
  recurring_day           smallint,
  recurring_time          text,
  left_mid_process        boolean NOT NULL DEFAULT false,
  phone                   text,
  notes                   text,
  notes_updated_at        timestamp with time zone,
  created_at              timestamp with time zone NOT NULL DEFAULT now(),
  updated_at              timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at              timestamp with time zone,
  recurring_end_time      text,
  recurring_start_date    date,
  recurring_end_date      date,
  balance_adjustment      numeric NOT NULL DEFAULT 0,
  sessions_done_adjustment integer NOT NULL DEFAULT 0,
  paid_adjustment         numeric NOT NULL DEFAULT 0,
  billing_mode            text NOT NULL DEFAULT 'package'::text,
  email                   text,
  meeting_type_id         uuid,
  price_overridden        boolean NOT NULL DEFAULT false,
  status_overridden       boolean NOT NULL DEFAULT false,
  address                 text,
  birth_date              date
);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_billing_mode_check CHECK ((billing_mode = ANY (ARRAY['package'::text, 'per_session'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_recurring_day_check CHECK (((recurring_day >= 0) AND (recurring_day <= 6)));
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_status_meta_check CHECK ((status_meta = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_status_id_fkey FOREIGN KEY (status_id) REFERENCES client_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_meeting_type_id_fkey FOREIGN KEY (meeting_type_id) REFERENCES meeting_types(id) ON DELETE SET NULL;
CREATE INDEX idx_clients_group ON public.clients USING btree (group_id);
CREATE INDEX idx_clients_project ON public.clients USING btree (project_id);
CREATE INDEX idx_clients_status ON public.clients USING btree (status);
CREATE INDEX idx_clients_user ON public.clients USING btree (user_id);
CREATE INDEX idx_clients_status_id ON public.clients USING btree (status_id);
CREATE INDEX idx_clients_meeting_type_id ON public.clients USING btree (meeting_type_id);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_own ON public.clients FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY clients_tier_limit ON public.clients FOR INSERT TO authenticated WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (NOT onboarding_completed()) OR (client_count() < 10)));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- community_* — the shared room (0080-0093)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.community_events (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL DEFAULT auth.uid(),
  title       text NOT NULL,
  description text,
  location    text,
  link        text,
  starts_at   timestamp with time zone NOT NULL,
  ends_at     timestamp with time zone,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_events ADD CONSTRAINT community_events_pkey PRIMARY KEY (id);
ALTER TABLE public.community_events ADD CONSTRAINT community_events_title_check CHECK (((char_length(btrim(title)) > 0) AND (char_length(title) <= 140)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_description_check CHECK (((description IS NULL) OR (char_length(description) <= 1000)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_location_check CHECK (((location IS NULL) OR (char_length(location) <= 200)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_link_check CHECK (((link IS NULL) OR ((char_length(link) <= 300) AND (link ~* '^https?://'::text))));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_check CHECK (((ends_at IS NULL) OR (ends_at >= starts_at)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_community_events_starts ON public.community_events USING btree (starts_at);
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_events_select ON public.community_events FOR SELECT TO authenticated USING ((community_access() OR (created_by = auth.uid())));
CREATE POLICY community_events_insert_own ON public.community_events FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND community_access()));
CREATE POLICY community_events_update ON public.community_events FOR UPDATE TO authenticated USING (((created_by = auth.uid()) OR is_community_admin())) WITH CHECK (((created_by = auth.uid()) OR is_community_admin()));
CREATE POLICY community_events_delete ON public.community_events FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR is_community_admin()));

CREATE TABLE public.community_messages (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid(),
  content     text NOT NULL,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at  timestamp with time zone,
  reply_to_id uuid,
  pinned_at   timestamp with time zone
);
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_content_check CHECK ((char_length(btrim(content)) > 0));
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_requires_profile FOREIGN KEY (user_id) REFERENCES community_profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES community_messages(id) ON DELETE SET NULL;
CREATE INDEX idx_community_messages_created_at ON public.community_messages USING btree (created_at DESC);
CREATE INDEX idx_community_messages_user ON public.community_messages USING btree (user_id);
CREATE INDEX idx_community_messages_reply_to ON public.community_messages USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL);
CREATE INDEX idx_community_messages_pinned ON public.community_messages USING btree (pinned_at) WHERE ((pinned_at IS NOT NULL) AND (deleted_at IS NULL));
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_messages_select_members ON public.community_messages FOR SELECT TO authenticated USING ((community_access() AND (deleted_at IS NULL)));
CREATE POLICY community_messages_insert_members ON public.community_messages FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND community_access()));
CREATE POLICY community_messages_insert_live ON public.community_messages FOR INSERT TO authenticated WITH CHECK ((deleted_at IS NULL));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE POLICY community_messages_soft_delete_own ON public.community_messages FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (deleted_at IS NULL))) WITH CHECK (((user_id = auth.uid()) AND (deleted_at IS NOT NULL)));
CREATE POLICY community_messages_admin_moderate ON public.community_messages FOR UPDATE TO authenticated USING (is_community_admin()) WITH CHECK (is_community_admin());
CREATE TRIGGER trg_community_messages_immutable BEFORE UPDATE ON public.community_messages FOR EACH ROW EXECUTE FUNCTION guard_immutable_columns('id', 'user_id', 'content', 'created_at');

CREATE TABLE public.community_message_mentions (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id        uuid NOT NULL,
  mentioned_user_id uuid NOT NULL,
  created_at        timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_pkey PRIMARY KEY (id);
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_uniq UNIQUE (message_id, mentioned_user_id);
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_mentioned_user_id_fkey FOREIGN KEY (mentioned_user_id) REFERENCES community_profiles(user_id) ON DELETE CASCADE;
CREATE INDEX idx_community_mentions_user ON public.community_message_mentions USING btree (mentioned_user_id);
ALTER TABLE public.community_message_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_mentions_select_members ON public.community_message_mentions FOR SELECT TO authenticated USING ((community_access() AND (EXISTS ( SELECT 1 FROM community_messages m WHERE ((m.id = community_message_mentions.message_id) AND (m.deleted_at IS NULL))))));
CREATE POLICY community_mentions_insert_author ON public.community_message_mentions FOR INSERT TO authenticated WITH CHECK ((community_access() AND (EXISTS ( SELECT 1 FROM community_messages m WHERE ((m.id = community_message_mentions.message_id) AND (m.user_id = auth.uid()))))));
CREATE TRIGGER trg_community_notify_mention AFTER INSERT ON public.community_message_mentions FOR EACH ROW EXECUTE FUNCTION community_notify_on_mention();

CREATE TABLE public.community_message_reactions (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id    uuid NOT NULL DEFAULT auth.uid(),
  emoji      text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_pkey PRIMARY KEY (id);
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_emoji_check CHECK (((char_length(btrim(emoji)) >= 1) AND (char_length(btrim(emoji)) <= 16)));
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_uniq UNIQUE (message_id, user_id, emoji);
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_community_reactions_user ON public.community_message_reactions USING btree (user_id);
ALTER TABLE public.community_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_reactions_select_members ON public.community_message_reactions FOR SELECT TO authenticated USING ((community_access() AND (EXISTS ( SELECT 1 FROM community_messages m WHERE ((m.id = community_message_reactions.message_id) AND (m.deleted_at IS NULL))))));
CREATE POLICY community_reactions_insert_own ON public.community_message_reactions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND community_access()));
CREATE POLICY community_reactions_delete_own ON public.community_message_reactions FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE TABLE public.community_message_reports (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL,
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  reason      text,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 500)));
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_uniq UNIQUE (message_id, reporter_id);
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_community_reports_message ON public.community_message_reports USING btree (message_id);
ALTER TABLE public.community_message_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_reports_select_admin ON public.community_message_reports FOR SELECT TO authenticated USING (is_community_admin());
CREATE POLICY community_reports_insert_own ON public.community_message_reports FOR INSERT TO authenticated WITH CHECK (((reporter_id = auth.uid()) AND community_access()));
CREATE POLICY community_reports_delete_admin ON public.community_message_reports FOR DELETE TO authenticated USING (is_community_admin());

CREATE TABLE public.community_notifications (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  actor_id     uuid,
  type         text NOT NULL,
  message_id   uuid,
  read_at      timestamp with time zone,
  created_at   timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_type_check CHECK ((type = 'mention'::text));
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES community_profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
CREATE INDEX idx_community_notifications_recipient ON public.community_notifications USING btree (recipient_id, created_at DESC);
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_notifications_select_own ON public.community_notifications FOR SELECT TO authenticated USING ((recipient_id = auth.uid()));
CREATE POLICY community_notifications_update_own ON public.community_notifications FOR UPDATE TO authenticated USING ((recipient_id = auth.uid())) WITH CHECK ((recipient_id = auth.uid()));

CREATE TABLE public.community_profiles (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL DEFAULT auth.uid(),
  display_name text NOT NULL,
  avatar_url   text,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  is_verified  boolean NOT NULL DEFAULT false,
  bio          text,
  headline     text,
  specialties  text[],
  link         text
);
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_user_uniq UNIQUE (user_id);
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_display_name_check CHECK ((char_length(btrim(display_name)) > 0));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_display_name_len CHECK ((char_length(display_name) <= 60));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_bio_len CHECK (((bio IS NULL) OR (char_length(bio) <= 300)));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_headline_len CHECK (((headline IS NULL) OR (char_length(headline) <= 80)));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_specialties_bounds CHECK (((specialties IS NULL) OR ((COALESCE(array_length(specialties, 1), 0) <= 8) AND (char_length(array_to_string(specialties, ','::text)) <= 200))));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_link_shape CHECK (((link IS NULL) OR ((char_length(link) <= 200) AND (link ~* '^https?://'::text))));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_profiles_select_members ON public.community_profiles FOR SELECT TO authenticated USING ((community_access() OR (user_id = auth.uid())));
CREATE POLICY community_profiles_insert_own ON public.community_profiles FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY community_profiles_name_not_reserved ON public.community_profiles FOR INSERT TO authenticated WITH CHECK ((NOT is_reserved_display_name(display_name)));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE POLICY community_profiles_unverified_insert ON public.community_profiles FOR INSERT TO authenticated WITH CHECK ((NOT is_verified));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE POLICY community_profiles_update_own ON public.community_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_community_profiles_reserved_name BEFORE UPDATE ON public.community_profiles FOR EACH ROW WHEN ((new.display_name IS DISTINCT FROM old.display_name)) EXECUTE FUNCTION community_profiles_guard_reserved_name();

CREATE TABLE public.community_reserved_names (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  pattern    text NOT NULL,
  match_mode text NOT NULL DEFAULT 'contains'::text,
  note       text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_pkey PRIMARY KEY (id);
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_pattern_uniq UNIQUE (pattern);
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_mode_chk CHECK ((match_mode = ANY (ARRAY['contains'::text, 'exact'::text])));
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_pattern_chk CHECK ((normalize_display_name(pattern) <> ''::text));
ALTER TABLE public.community_reserved_names ENABLE ROW LEVEL SECURITY;
-- No policies: RLS on with none defined means authenticated has NO access.
-- Reached through the service role only. Intentional for a moderation list.

-- ════════════════════════════════════════════════════════════════
-- daily_answers — answers to the daily questions
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.daily_answers (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  user_question_id uuid NOT NULL,
  date             date NOT NULL,
  value_num        numeric,
  value_text       text,
  note             text,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at       timestamp with time zone
);
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_value_xor CHECK ((((value_num IS NOT NULL) AND (value_text IS NULL)) OR ((value_num IS NULL) AND (value_text IS NOT NULL))));
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_user_question_id_fkey FOREIGN KEY (user_question_id) REFERENCES user_questions(id) ON DELETE CASCADE;
CREATE INDEX idx_daily_answers_date ON public.daily_answers USING btree (date);
CREATE INDEX idx_daily_answers_question ON public.daily_answers USING btree (user_question_id);
CREATE UNIQUE INDEX idx_daily_answers_uniq ON public.daily_answers USING btree (user_question_id, date) WHERE (deleted_at IS NULL);
CREATE INDEX idx_daily_answers_user ON public.daily_answers USING btree (user_id);
ALTER TABLE public.daily_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_answers_own ON public.daily_answers FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_daily_answers_updated BEFORE UPDATE ON public.daily_answers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- feedback — beta feedback + its admin triage fields
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.feedback (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL DEFAULT auth.uid(),
  message        text NOT NULL,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  type           text,
  status         text NOT NULL DEFAULT 'new'::text,
  platform       text,
  source         text NOT NULL DEFAULT 'app'::text,
  classification text,
  surface        text,
  title          text,
  notes          text
);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_message_check CHECK ((char_length(btrim(message)) > 0));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_type_check CHECK (((type IS NULL) OR (type = ANY (ARRAY['bug'::text, 'idea'::text, 'praise'::text, 'other'::text]))));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'waiting_decision'::text, 'done'::text, 'rejected'::text])));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_platform_check CHECK (((platform IS NULL) OR (platform = ANY (ARRAY['mobile'::text, 'desktop'::text, 'both'::text, 'unknown'::text]))));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_source_check CHECK ((source = ANY (ARRAY['app'::text, 'email'::text, 'manual'::text])));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_classification_check CHECK (((classification IS NULL) OR (classification = ANY (ARRAY['bug'::text, 'dev'::text, 'unclear'::text]))));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_surface_check CHECK (((surface IS NULL) OR (surface = ANY (ARRAY['technical'::text, 'design'::text, 'both'::text]))));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_feedback_created_at ON public.feedback USING btree (created_at DESC);
CREATE INDEX idx_feedback_status ON public.feedback USING btree (status);
CREATE INDEX idx_feedback_user ON public.feedback USING btree (user_id);
CREATE INDEX idx_feedback_classification ON public.feedback USING btree (classification);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_select ON public.feedback FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY feedback_insert ON public.feedback FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
-- Triage happens through the admin edge function (service role); users see only their own.

-- ════════════════════════════════════════════════════════════════
-- goal_categories / goal_entries / goals
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.goal_categories (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  key              text,
  name             text NOT NULL,
  icon             text,
  color            text,
  measurement_type text NOT NULL,
  data_source      text,
  graph_type       text NOT NULL,
  builtin          boolean NOT NULL DEFAULT false,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at       timestamp with time zone
);
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_graph_type_check CHECK ((graph_type = ANY (ARRAY['cumulative'::text, 'delta'::text])));
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_measurement_type_check CHECK ((measurement_type = ANY (ARRAY['auto'::text, 'manual'::text])));
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_goal_categories_user ON public.goal_categories USING btree (user_id);
ALTER TABLE public.goal_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_categories_own ON public.goal_categories FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_goal_categories_updated BEFORE UPDATE ON public.goal_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.goal_entries (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  category_id uuid NOT NULL,
  project_id  uuid,
  group_id    uuid,
  date        date NOT NULL,
  value       numeric NOT NULL,
  note        text,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  updated_at  timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at  timestamp with time zone
);
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES goal_categories(id) ON DELETE CASCADE;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_goal_entries_category ON public.goal_entries USING btree (category_id);
CREATE INDEX idx_goal_entries_date ON public.goal_entries USING btree (date);
CREATE INDEX idx_goal_entries_user ON public.goal_entries USING btree (user_id);
CREATE INDEX idx_goal_entries_project ON public.goal_entries USING btree (project_id);
CREATE INDEX idx_goal_entries_group ON public.goal_entries USING btree (group_id);
ALTER TABLE public.goal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_entries_own ON public.goal_entries FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_goal_entries_updated BEFORE UPDATE ON public.goal_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.goals (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  category_id            uuid NOT NULL,
  parent_goal_id         uuid,
  project_id             uuid,
  group_id               uuid,
  label                  text,
  time_frame             text NOT NULL,
  target_value           numeric NOT NULL,
  target_date            date,
  importance             integer NOT NULL,
  tracking_method        text NOT NULL DEFAULT 'manual'::text,
  tracked_by_question_id uuid,
  measurement_type       text,
  data_source            text,
  manual_input_type      text,
  schedule_pattern       jsonb,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at             timestamp with time zone
);
ALTER TABLE public.goals ADD CONSTRAINT goals_pkey PRIMARY KEY (id);
ALTER TABLE public.goals ADD CONSTRAINT goals_importance_check CHECK (((importance >= 1) AND (importance <= 5)));
ALTER TABLE public.goals ADD CONSTRAINT goals_manual_input_type_check CHECK ((manual_input_type = ANY (ARRAY['number'::text, 'slider'::text, 'yes_no'::text])));
ALTER TABLE public.goals ADD CONSTRAINT goals_measurement_type_check CHECK ((measurement_type = ANY (ARRAY['auto'::text, 'manual'::text])));
ALTER TABLE public.goals ADD CONSTRAINT goals_time_frame_check CHECK ((time_frame = ANY (ARRAY['deadline'::text, 'monthly'::text, 'weekly'::text])));
ALTER TABLE public.goals ADD CONSTRAINT goals_tracking_method_check CHECK ((tracking_method = ANY (ARRAY['manual'::text, 'daily_question'::text])));
ALTER TABLE public.goals ADD CONSTRAINT goals_category_id_fkey FOREIGN KEY (category_id) REFERENCES goal_categories(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD CONSTRAINT goals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD CONSTRAINT goals_parent_goal_id_fkey FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD CONSTRAINT goals_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD CONSTRAINT goals_tracked_by_question_id_fkey FOREIGN KEY (tracked_by_question_id) REFERENCES user_questions(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_goals_category ON public.goals USING btree (category_id);
CREATE INDEX idx_goals_group ON public.goals USING btree (group_id);
CREATE INDEX idx_goals_project ON public.goals USING btree (project_id);
CREATE INDEX idx_goals_user ON public.goals USING btree (user_id);
CREATE INDEX idx_goals_tracked_question ON public.goals USING btree (tracked_by_question_id);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goals_own ON public.goals FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY goals_tier_limit ON public.goals FOR INSERT TO authenticated WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (goal_count() < 3)));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- group_members / groups
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.group_members (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  group_id                 uuid NOT NULL,
  client_id                uuid NOT NULL,
  joined_at                timestamp with time zone NOT NULL,
  left_at                  timestamp with time zone,
  total_override           numeric,
  has_custom_price         boolean NOT NULL DEFAULT false,
  package_sessions_override integer,
  left_mid_process         boolean NOT NULL DEFAULT false,
  created_at               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at               timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at               timestamp with time zone
);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_group_members_client ON public.group_members USING btree (client_id);
CREATE INDEX idx_group_members_group ON public.group_members USING btree (group_id);
CREATE INDEX idx_group_members_user ON public.group_members USING btree (user_id);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_members_own ON public.group_members FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_group_members_updated BEFORE UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.groups (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  project_id           uuid NOT NULL,
  name                 text NOT NULL,
  color                text,
  package_price        numeric,
  package_sessions     integer,
  recurring_day        smallint,
  recurring_time       text,
  status               text NOT NULL DEFAULT 'active'::text,
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at           timestamp with time zone,
  price_per_session    numeric,
  billing_mode         text NOT NULL DEFAULT 'package'::text,
  recurring_end_time   text,
  recurring_start_date date,
  recurring_end_date   date
);
ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE public.groups ADD CONSTRAINT groups_billing_mode_check CHECK ((billing_mode = ANY (ARRAY['package'::text, 'per_session'::text, 'none'::text])));
ALTER TABLE public.groups ADD CONSTRAINT groups_recurring_day_check CHECK (((recurring_day >= 0) AND (recurring_day <= 6)));
ALTER TABLE public.groups ADD CONSTRAINT groups_status_check CHECK ((status = ANY (ARRAY['active'::text, 'in_development'::text, 'ended'::text])));
ALTER TABLE public.groups ADD CONSTRAINT groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_groups_project ON public.groups USING btree (project_id);
CREATE INDEX idx_groups_status ON public.groups USING btree (status);
CREATE INDEX idx_groups_user ON public.groups USING btree (user_id);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_own ON public.groups FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- landing_events — anonymous marketing funnel (0050)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.landing_events (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  type       text NOT NULL,
  session_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_events ADD CONSTRAINT landing_events_pkey PRIMARY KEY (id);
ALTER TABLE public.landing_events ADD CONSTRAINT landing_events_type_check CHECK ((type = ANY (ARRAY['view'::text, 'signup_start'::text, 'scroll_50'::text, 'scroll_75'::text, 'scroll_100'::text, 'faq_open'::text, 'engaged'::text])));
CREATE INDEX idx_landing_events_created ON public.landing_events USING btree (created_at);
CREATE INDEX idx_landing_events_type_created ON public.landing_events USING btree (type, created_at);
ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;
-- No policies: written by the edge function via the service role, read in admin.

-- ════════════════════════════════════════════════════════════════
-- lead_pages / lead_sources / lead_status_log / lead_statuses / leads
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.lead_pages (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  title        text NOT NULL DEFAULT ''::text,
  published    boolean NOT NULL DEFAULT false,
  auto_approve boolean NOT NULL DEFAULT false,
  content      jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at   timestamp with time zone,
  project_id   uuid,
  slug         text
);
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_slug_format CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));
CREATE INDEX idx_lead_pages_user ON public.lead_pages USING btree (user_id);
CREATE INDEX idx_lead_pages_project ON public.lead_pages USING btree (project_id);
CREATE UNIQUE INDEX idx_lead_pages_slug_unique ON public.lead_pages USING btree (lower(slug)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
ALTER TABLE public.lead_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_pages_own ON public.lead_pages FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_lead_pages_updated BEFORE UPDATE ON public.lead_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.lead_sources (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  name       text NOT NULL,
  color      text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_lead_sources_user ON public.lead_sources USING btree (user_id);
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_sources_own ON public.lead_sources FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_lead_sources_updated BEFORE UPDATE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.lead_status_log (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  lead_id        uuid NOT NULL,
  from_status_id uuid,
  to_status_id   uuid NOT NULL,
  changed_at     timestamp with time zone NOT NULL,
  source         text NOT NULL,
  created_at     timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_source_check CHECK ((source = ANY (ARRAY['manual_drag'::text, 'manual_select'::text, 'converted'::text, 'auto_expire'::text])));
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES lead_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES lead_statuses(id) ON DELETE CASCADE;
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_lead_status_log_lead ON public.lead_status_log USING btree (lead_id);
CREATE INDEX idx_lead_status_log_user ON public.lead_status_log USING btree (user_id);
CREATE INDEX idx_lead_status_log_user_changed ON public.lead_status_log USING btree (user_id, changed_at);
CREATE INDEX idx_lead_status_log_from ON public.lead_status_log USING btree (from_status_id);
CREATE INDEX idx_lead_status_log_to ON public.lead_status_log USING btree (to_status_id);
ALTER TABLE public.lead_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_status_log_insert ON public.lead_status_log FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY lead_status_log_select ON public.lead_status_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE TABLE public.lead_statuses (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  meta_category text NOT NULL,
  display_name  text NOT NULL,
  color         text,
  icon          text,
  is_default    boolean NOT NULL DEFAULT false,
  legacy_key    text,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at    timestamp with time zone,
  sort_order    integer NOT NULL DEFAULT 0
);
ALTER TABLE public.lead_statuses ADD CONSTRAINT lead_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_statuses ADD CONSTRAINT lead_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['in_process'::text, 'converted'::text, 'not_relevant'::text])));
ALTER TABLE public.lead_statuses ADD CONSTRAINT lead_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_lead_statuses_user ON public.lead_statuses USING btree (user_id);
ALTER TABLE public.lead_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_statuses_own ON public.lead_statuses FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_lead_statuses_updated BEFORE UPDATE ON public.lead_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.leads (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  name                   text NOT NULL,
  phone                  text,
  source_id              uuid,
  status                 text NOT NULL DEFAULT 'new'::text,
  status_id              uuid,
  status_meta            text NOT NULL DEFAULT 'in_process'::text,
  inquiry_date           date,
  follow_up_date         date,
  last_status_changed_at timestamp with time zone,
  notes                  text,
  converted_to_client_id uuid,
  converted_at           timestamp with time zone,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at             timestamp with time zone,
  closed_at              timestamp with time zone,
  project_id             uuid,
  group_id               uuid,
  page_id                uuid,
  email                  text,
  data                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_review         boolean NOT NULL DEFAULT false
);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_contact'::text, 'intro_call'::text, 'pending_decision'::text, 'closed'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_status_meta_check CHECK ((status_meta = ANY (ARRAY['in_process'::text, 'converted'::text, 'not_relevant'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_converted_to_client_id_fkey FOREIGN KEY (converted_to_client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_id_fkey FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_id_fkey FOREIGN KEY (status_id) REFERENCES lead_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD CONSTRAINT leads_page_id_fkey FOREIGN KEY (page_id) REFERENCES lead_pages(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_group ON public.leads USING btree (group_id);
CREATE INDEX idx_leads_project ON public.leads USING btree (project_id);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX idx_leads_status_meta ON public.leads USING btree (status_meta);
CREATE INDEX idx_leads_user ON public.leads USING btree (user_id);
CREATE INDEX idx_leads_status_id ON public.leads USING btree (status_id);
CREATE INDEX idx_leads_source ON public.leads USING btree (source_id);
CREATE INDEX idx_leads_converted ON public.leads USING btree (converted_to_client_id);
CREATE INDEX idx_leads_page ON public.leads USING btree (page_id);
CREATE INDEX idx_leads_pending_review ON public.leads USING btree (user_id) WHERE pending_review;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_own ON public.leads FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- meeting_types (0043) / moon_snapshots
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.meeting_types (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  name             text NOT NULL,
  default_price    numeric,
  color            text,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at       timestamp with time zone,
  duration_minutes integer
);
ALTER TABLE public.meeting_types ADD CONSTRAINT meeting_types_pkey PRIMARY KEY (id);
ALTER TABLE public.meeting_types ADD CONSTRAINT meeting_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_meeting_types_user ON public.meeting_types USING btree (user_id);
ALTER TABLE public.meeting_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_types_own ON public.meeting_types FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_meeting_types_updated BEFORE UPDATE ON public.meeting_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.moon_snapshots (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  date       date NOT NULL,
  score      numeric NOT NULL,
  paced      numeric,
  confidence numeric,
  breakdown  jsonb,
  reflection text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.moon_snapshots ADD CONSTRAINT moon_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.moon_snapshots ADD CONSTRAINT moon_snapshots_user_date_uniq UNIQUE (user_id, date);
ALTER TABLE public.moon_snapshots ADD CONSTRAINT moon_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_moon_snapshots_date ON public.moon_snapshots USING btree (date);
CREATE INDEX idx_moon_snapshots_user ON public.moon_snapshots USING btree (user_id);
ALTER TABLE public.moon_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY moon_snapshots_own ON public.moon_snapshots FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_moon_snapshots_updated BEFORE UPDATE ON public.moon_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- payment_plans / payment_installments (0056) / payment_requests (0061)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.payment_plans (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  client_id        uuid NOT NULL,
  project_id       uuid,
  total_amount     numeric NOT NULL DEFAULT 0,
  num_installments integer NOT NULL DEFAULT 1,
  notes            text,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at       timestamp with time zone
);
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX idx_payment_plans_user ON public.payment_plans USING btree (user_id);
CREATE INDEX idx_payment_plans_client ON public.payment_plans USING btree (client_id);
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_plans_own ON public.payment_plans FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_payment_plans_updated BEFORE UPDATE ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.payment_installments (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  plan_id        uuid NOT NULL,
  num            integer NOT NULL,
  due_date       date,
  amount         numeric NOT NULL DEFAULT 0,
  received       boolean NOT NULL DEFAULT false,
  received_date  date,
  payment_method text,
  transaction_id uuid,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  updated_at     timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at     timestamp with time zone
);
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_method_chk CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['bank_transfer'::text, 'cash'::text, 'credit_card'::text, 'app'::text, 'other'::text]))));
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES payment_plans(id) ON DELETE CASCADE;
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
CREATE INDEX idx_payment_installments_user ON public.payment_installments USING btree (user_id);
CREATE INDEX idx_payment_installments_plan ON public.payment_installments USING btree (plan_id);
CREATE UNIQUE INDEX idx_payment_installments_plan_num ON public.payment_installments USING btree (plan_id, num) WHERE (deleted_at IS NULL);
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_installments_own ON public.payment_installments FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_payment_installments_updated BEFORE UPDATE ON public.payment_installments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.payment_requests (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  client_id          uuid,
  transaction_id     uuid,
  installment_id     uuid,
  booking_id         uuid,   -- NOTE: no FK. client_id/transaction_id/installment_id
                             -- each have one; this column does not, so deleting a
                             -- booking leaves the reference dangling. Confirmed
                             -- absent in the live DB, not an omission here.
  source             text NOT NULL,
  amount             numeric NOT NULL,
  description        text,
  status             text NOT NULL DEFAULT 'pending'::text,
  grow_process_id    text,
  grow_process_token text,
  grow_transaction_id text,
  payment_url        text,
  paid_at            timestamp with time zone,
  created_at         timestamp with time zone NOT NULL DEFAULT now(),
  updated_at         timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_source_check CHECK ((source = ANY (ARRAY['client'::text, 'transaction'::text, 'installment'::text, 'booking'::text])));
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'expired'::text, 'cancelled'::text, 'failed'::text])));
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES payment_installments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX payment_requests_grow_tx_uniq ON public.payment_requests USING btree (user_id, grow_transaction_id) WHERE (grow_transaction_id IS NOT NULL);
CREATE INDEX payment_requests_user ON public.payment_requests USING btree (user_id);
CREATE INDEX payment_requests_client ON public.payment_requests USING btree (user_id, client_id);
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_requests_select_own ON public.payment_requests FOR SELECT TO authenticated USING ((user_id = auth.uid()));
-- Writes go through the Grow edge functions (service role) only.

-- ════════════════════════════════════════════════════════════════
-- pending_grow_imports (0078) / pending_invoice_imports
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.pending_grow_imports (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  grow_transaction_id    text NOT NULL,
  amount                 numeric,
  currency               text DEFAULT 'ILS'::text,
  charge_date            date,
  customer_name          text,
  client_id              uuid,
  status                 text NOT NULL DEFAULT 'pending'::text,
  created_transaction_id uuid,
  raw                    jsonb,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_uniq UNIQUE (user_id, grow_transaction_id);
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'imported'::text, 'dismissed'::text])));
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_created_transaction_id_fkey FOREIGN KEY (created_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
CREATE INDEX idx_pending_grow_imports_user ON public.pending_grow_imports USING btree (user_id);
CREATE INDEX idx_pending_grow_imports_status ON public.pending_grow_imports USING btree (status);
ALTER TABLE public.pending_grow_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY pending_grow_imports_select ON public.pending_grow_imports FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE TRIGGER trg_pending_grow_imports_updated BEFORE UPDATE ON public.pending_grow_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.pending_invoice_imports (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  provider               text NOT NULL,
  external_document_id   text NOT NULL,
  document_type          text,
  document_number        text,
  amount                 numeric,
  currency               text DEFAULT 'ILS'::text,
  doc_date               date,
  customer_name          text,
  document_url           text,
  client_id              uuid,
  status                 text NOT NULL DEFAULT 'pending'::text,
  created_transaction_id uuid,
  raw                    jsonb,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_uniq UNIQUE (user_id, provider, external_document_id);
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'imported'::text, 'dismissed'::text])));
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_created_transaction_id_fkey FOREIGN KEY (created_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
CREATE INDEX idx_pending_invoice_imports_user ON public.pending_invoice_imports USING btree (user_id);
CREATE INDEX idx_pending_invoice_imports_status ON public.pending_invoice_imports USING btree (status);
ALTER TABLE public.pending_invoice_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY pending_invoice_imports_select ON public.pending_invoice_imports FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE TRIGGER trg_pending_invoice_imports_updated BEFORE UPDATE ON public.pending_invoice_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- projects / quotes / recurring_templates / reminders
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.projects (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  name       text NOT NULL,
  color      text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
ALTER TABLE public.projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_projects_user ON public.projects USING btree (user_id);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_own ON public.projects FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY projects_tier_limit ON public.projects FOR INSERT TO authenticated WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (project_count() < 2)));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Shared content, not per-user. Display now comes from the i18n `quotes`
-- namespace; this table is dormant for display but still readable.
CREATE TABLE public.quotes (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  text        text NOT NULL,
  author      text,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  updated_at  timestamp with time zone NOT NULL DEFAULT now(),
  category    text,
  text_male   text,
  text_female text
);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX idx_quotes_text_uniq ON public.quotes USING btree (text);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.recurring_templates (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  amount        numeric NOT NULL,
  type          text NOT NULL,
  "desc"        text,
  project_id    uuid,
  client_id     uuid,
  category_id   uuid,
  cadence_type  text NOT NULL DEFAULT 'monthly_date'::text,
  day_of_month  integer,
  day_of_week   smallint,
  until_date    date,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at    timestamp with time zone,
  trigger_type  text NOT NULL DEFAULT 'schedule'::text
);
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_cadence_type_check CHECK ((cadence_type = ANY (ARRAY['monthly_date'::text, 'weekly'::text])));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 31)));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['schedule'::text, 'on_meeting'::text])));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_recurring_templates_client ON public.recurring_templates USING btree (client_id);
CREATE INDEX idx_recurring_templates_project ON public.recurring_templates USING btree (project_id);
CREATE INDEX idx_recurring_templates_user ON public.recurring_templates USING btree (user_id);
CREATE INDEX idx_recurring_templates_category ON public.recurring_templates USING btree (category_id);
ALTER TABLE public.recurring_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_templates_own ON public.recurring_templates FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_recurring_templates_updated BEFORE UPDATE ON public.recurring_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.reminders (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  title              text NOT NULL,
  description        text,
  scheduled_at       timestamp with time zone NOT NULL,
  recurrence_type    text NOT NULL DEFAULT 'none'::text,
  recurrence_pattern jsonb,
  end_date           date,
  linked_to_type     text,
  linked_to_id       text,
  status             text NOT NULL DEFAULT 'pending'::text,
  type               text,
  channel            text,
  created_at         timestamp with time zone NOT NULL DEFAULT now(),
  updated_at         timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at         timestamp with time zone,
  category_id        uuid
);
ALTER TABLE public.reminders ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);
ALTER TABLE public.reminders ADD CONSTRAINT reminders_linked_to_type_check CHECK ((linked_to_type = ANY (ARRAY['client'::text, 'project'::text, 'group'::text, 'task'::text, 'transaction'::text, 'lead'::text, 'period'::text])));
ALTER TABLE public.reminders ADD CONSTRAINT reminders_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['none'::text, 'weekly'::text, 'monthly_date'::text, 'every_x_days'::text])));
ALTER TABLE public.reminders ADD CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'triggered'::text, 'completed'::text, 'dismissed'::text, 'snoozed'::text])));
ALTER TABLE public.reminders ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reminders ADD CONSTRAINT reminders_category_id_fkey FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_reminders_linked ON public.reminders USING btree (linked_to_type, linked_to_id);
CREATE INDEX idx_reminders_status ON public.reminders USING btree (status);
CREATE INDEX idx_reminders_user ON public.reminders USING btree (user_id);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminders_own ON public.reminders FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_reminders_updated BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- scheduled_meetings / sessions
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.scheduled_meetings (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id   uuid NOT NULL,
  scheduled_at timestamp with time zone NOT NULL,
  status       text NOT NULL DEFAULT 'pending'::text,
  session_id   uuid,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_pkey PRIMARY KEY (id);
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'skipped'::text, 'expired'::text])));
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_subject_type_check CHECK ((subject_type = ANY (ARRAY['client'::text, 'group'::text])));
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_scheduled_meetings_status ON public.scheduled_meetings USING btree (status);
CREATE INDEX idx_scheduled_meetings_subject ON public.scheduled_meetings USING btree (subject_type, subject_id);
CREATE INDEX idx_scheduled_meetings_user ON public.scheduled_meetings USING btree (user_id);
CREATE INDEX idx_scheduled_meetings_session ON public.scheduled_meetings USING btree (session_id);
CREATE UNIQUE INDEX scheduled_meetings_no_dup ON public.scheduled_meetings USING btree (user_id, subject_type, subject_id, scheduled_at) WHERE (status = 'pending'::text);
ALTER TABLE public.scheduled_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_meetings_own ON public.scheduled_meetings FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_scheduled_meetings_updated BEFORE UPDATE ON public.scheduled_meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.sessions (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  client_id    uuid,
  group_id     uuid,
  subject_type text NOT NULL,
  subject_id   uuid NOT NULL,
  date         timestamp with time zone NOT NULL,
  notes        text,
  summary      text,
  num          integer NOT NULL,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at   timestamp with time zone
);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_subject_type_check CHECK ((subject_type = ANY (ARRAY['client'::text, 'group'::text])));
ALTER TABLE public.sessions ADD CONSTRAINT sessions_subject_xor CHECK ((((client_id IS NOT NULL) AND (group_id IS NULL)) OR ((client_id IS NULL) AND (group_id IS NOT NULL))));
ALTER TABLE public.sessions ADD CONSTRAINT sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_sessions_client ON public.sessions USING btree (client_id);
CREATE INDEX idx_sessions_date ON public.sessions USING btree (date);
CREATE INDEX idx_sessions_group ON public.sessions USING btree (group_id);
CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_own ON public.sessions FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- site_pages — the shared block engine behind landing/lead/booking (0066+)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.site_pages (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  kind              text NOT NULL DEFAULT 'landing'::text,
  title             text NOT NULL DEFAULT ''::text,
  published         boolean NOT NULL DEFAULT false,
  slug              text,
  theme             jsonb NOT NULL DEFAULT '{}'::jsonb,
  sections          jsonb NOT NULL DEFAULT '[]'::jsonb,
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id        uuid,
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at        timestamp with time zone,
  published_snapshot jsonb
);
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_kind_chk CHECK ((kind = ANY (ARRAY['landing'::text, 'lead'::text, 'booking'::text])));
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_slug_format CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_site_pages_user ON public.site_pages USING btree (user_id);
CREATE UNIQUE INDEX idx_site_pages_kind_slug_unique ON public.site_pages USING btree (kind, lower(slug)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_pages_own ON public.site_pages FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY site_pages_tier_gate ON public.site_pages FOR INSERT TO authenticated WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (site_page_count(kind) < 1)));  -- RESTRICTIVE in the live DB (AND-ed). See header.
CREATE TRIGGER trg_site_pages_updated BEFORE UPDATE ON public.site_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- task_categories / task_statuses / tasks
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.task_categories (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  name       text NOT NULL,
  color      text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.task_categories ADD CONSTRAINT task_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.task_categories ADD CONSTRAINT task_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_task_categories_user ON public.task_categories USING btree (user_id);
ALTER TABLE public.task_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_categories_own ON public.task_categories FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_task_categories_updated BEFORE UPDATE ON public.task_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.task_statuses (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  meta_category text NOT NULL,
  display_name  text NOT NULL,
  icon          text,
  color         text,
  is_default    boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at    timestamp with time zone
);
ALTER TABLE public.task_statuses ADD CONSTRAINT task_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.task_statuses ADD CONSTRAINT task_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['open'::text, 'done'::text])));
ALTER TABLE public.task_statuses ADD CONSTRAINT task_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_task_statuses_user ON public.task_statuses USING btree (user_id);
ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_statuses_own ON public.task_statuses FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_task_statuses_updated BEFORE UPDATE ON public.task_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.tasks (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  title        text NOT NULL,
  priority     text NOT NULL,
  status       text NOT NULL DEFAULT 'todo'::text,
  project_id   uuid,
  client_id    uuid,
  completed_at timestamp with time zone,
  created_at   timestamp with time zone NOT NULL DEFAULT now(),
  updated_at   timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at   timestamp with time zone,
  status_id    uuid,
  category_id  uuid,
  due_at       timestamp with time zone
);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'done'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_id_fkey FOREIGN KEY (status_id) REFERENCES task_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_category_id ON public.tasks USING btree (category_id);
CREATE INDEX idx_tasks_client ON public.tasks USING btree (client_id);
CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);
CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX idx_tasks_status_id ON public.tasks USING btree (status_id);
CREATE INDEX idx_tasks_user ON public.tasks USING btree (user_id);
CREATE INDEX idx_tasks_user_due ON public.tasks USING btree (user_id, due_at) WHERE ((due_at IS NOT NULL) AND (deleted_at IS NULL));
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_own ON public.tasks FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- transactions — the money ledger. Everything financial resolves here.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.transactions (
  id                             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                        uuid NOT NULL,
  amount                         numeric NOT NULL,
  type                           text NOT NULL,
  "desc"                         text,
  date                           date NOT NULL,
  status                         text NOT NULL DEFAULT 'confirmed'::text,
  project_id                     uuid,
  client_id                      uuid,
  category_id                    uuid,
  recurring_id                   uuid,
  orphaned_from                  jsonb,
  created_at                     timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                     timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at                     timestamp with time zone,
  invoice_provider               text,
  invoice_document_id            text,
  invoice_document_number        text,
  invoice_document_type          text,
  invoice_document_url           text,
  invoice_synced_at              timestamp with time zone,
  invoice_credited_at            timestamp with time zone,
  invoice_credit_document_id     text,
  invoice_credit_document_number text,
  invoice_credit_document_url    text,
  payment_method                 text,
  recipient_name                 text,
  recipient_email                text,
  recipient_phone                text,
  recipient_tax_id               text,
  grow_transaction_id            text,
  scheduled_meeting_id           uuid   -- NOTE: no FK, though every other *_id here
                                        -- has one. It drives idx_transactions_recurring_meeting,
                                        -- so a deleted scheduled_meeting leaves the
                                        -- charge pointing at nothing. Confirmed absent
                                        -- in the live DB.
);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'pending'::text, 'skipped'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_valid CHECK (((amount >= (0)::numeric) AND (amount <= '1000000000000'::numeric)));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['bank_transfer'::text, 'cash'::text, 'credit_card'::text, 'app'::text, 'other'::text]))));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_recurring_id_fkey FOREIGN KEY (recurring_id) REFERENCES recurring_templates(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_transactions_client ON public.transactions USING btree (client_id);
CREATE INDEX idx_transactions_date ON public.transactions USING btree (date);
CREATE INDEX idx_transactions_project ON public.transactions USING btree (project_id);
CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);
CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);
CREATE INDEX idx_transactions_category ON public.transactions USING btree (category_id);
CREATE INDEX idx_transactions_recurring ON public.transactions USING btree (recurring_id);
CREATE UNIQUE INDEX idx_transactions_invoice_doc_uniq ON public.transactions USING btree (user_id, invoice_provider, invoice_document_id) WHERE ((invoice_document_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX transactions_grow_tx_uniq ON public.transactions USING btree (user_id, grow_transaction_id) WHERE (grow_transaction_id IS NOT NULL);
-- 0094: one recurring charge per DATE for schedule-triggered templates, and
-- one per MEETING for on_meeting ones. Two partial indexes, not one.
CREATE UNIQUE INDEX idx_transactions_recurring_slot ON public.transactions USING btree (user_id, recurring_id, date) WHERE ((recurring_id IS NOT NULL) AND (scheduled_meeting_id IS NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX idx_transactions_recurring_meeting ON public.transactions USING btree (user_id, recurring_id, scheduled_meeting_id) WHERE ((recurring_id IS NOT NULL) AND (scheduled_meeting_id IS NOT NULL) AND (deleted_at IS NULL));
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_own ON public.transactions FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- user_consent (0029) / user_integrations / user_preferences
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.user_consent (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  kind        text NOT NULL,
  version     text,
  accepted    boolean NOT NULL DEFAULT true,
  source      text,
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_pkey PRIMARY KEY (id);
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_uniq UNIQUE (user_id, kind, accepted_at);
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_kind_check CHECK ((kind = ANY (ARRAY['privacy'::text, 'dpa'::text, 'marketing'::text, 'terms'::text, 'cookies'::text])));
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_user_consent_user ON public.user_consent USING btree (user_id);
ALTER TABLE public.user_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_consent_select ON public.user_consent FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY user_consent_insert ON public.user_consent FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_user_consent_stamp BEFORE INSERT ON public.user_consent FOR EACH ROW EXECUTE FUNCTION user_consent_stamp();

-- Holds OAuth tokens and provider API secrets. RLS is ON with NO policies,
-- so `authenticated` cannot read it at all — reached only through the edge
-- functions' service role. That is deliberate, and worth preserving.
CREATE TABLE public.user_integrations (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  provider               text NOT NULL DEFAULT 'google_calendar'::text,
  access_token           text,
  refresh_token          text,
  token_expiry           timestamp with time zone,
  sync_from              date,
  sync_token             text,
  last_synced_at         timestamp with time zone,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now(),
  api_key                text,
  api_secret             text,
  environment            text,
  auto_import            boolean NOT NULL DEFAULT true,
  webhook_token          text,
  last_polled_at         timestamp with time zone,
  credentials_invalid_at timestamp with time zone,
  business_type          text,
  page_code              text,
  grow_auto_receipt      boolean NOT NULL DEFAULT false,
  scheduled_scan         boolean NOT NULL DEFAULT false,
  grow_import_enabled    boolean NOT NULL DEFAULT false
);
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_pkey PRIMARY KEY (id);
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_user_provider_uniq UNIQUE (user_id, provider);
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_environment_check CHECK (((environment IS NULL) OR (environment = ANY (ARRAY['sandbox'::text, 'production'::text]))));
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_business_type_check CHECK (((business_type IS NULL) OR (business_type = ANY (ARRAY['exempt'::text, 'licensed'::text]))));
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_user_integrations_user ON public.user_integrations USING btree (user_id);
CREATE UNIQUE INDEX idx_user_integrations_webhook_token ON public.user_integrations USING btree (webhook_token) WHERE (webhook_token IS NOT NULL);
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_user_integrations_updated BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.user_preferences (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  updated_at  timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_uniq UNIQUE (user_id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_user_preferences_user ON public.user_preferences USING btree (user_id);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_preferences_own ON public.user_preferences FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_user_preferences_updated BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- user_questions / user_quotes / user_subscriptions (0075)
-- ════════════════════════════════════════════════════════════════
CREATE TABLE public.user_questions (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  template_key     text,
  custom_text      text,
  scale_type       text NOT NULL,
  icon             text,
  active           boolean NOT NULL DEFAULT true,
  "order"          integer NOT NULL DEFAULT 0,
  schedule_pattern jsonb NOT NULL DEFAULT '{"type": "days_of_week", "values": [0, 1, 2, 3, 4, 5, 6]}'::jsonb,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at       timestamp with time zone
);
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_scale_type_check CHECK ((scale_type = ANY (ARRAY['1-10'::text, 'yes_no'::text, 'free_text'::text])));
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_source_chk CHECK (((template_key IS NOT NULL) OR (custom_text IS NOT NULL)));
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_user_questions_user ON public.user_questions USING btree (user_id);
ALTER TABLE public.user_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_questions_own ON public.user_questions FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_user_questions_updated BEFORE UPDATE ON public.user_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.user_quotes (
  id         uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  text       text NOT NULL,
  author     text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.user_quotes ADD CONSTRAINT user_quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.user_quotes ADD CONSTRAINT user_quotes_text_check CHECK ((char_length(btrim(text)) > 0));
ALTER TABLE public.user_quotes ADD CONSTRAINT user_quotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_user_quotes_user ON public.user_quotes USING btree (user_id);
ALTER TABLE public.user_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_quotes_own ON public.user_quotes FOR ALL TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE TRIGGER trg_user_quotes_updated BEFORE UPDATE ON public.user_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.user_subscriptions (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  tier                   text NOT NULL DEFAULT 'free'::text,
  status                 text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamp with time zone,
  beta_exempt_until      timestamp with time zone,
  subscribed_at          timestamp with time zone,
  locked_price           numeric,
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_user_uniq UNIQUE (user_id);
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_tier_chk CHECK ((tier = ANY (ARRAY['free'::text, 'basic'::text, 'premium'::text])));
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_user_subscriptions_user ON public.user_subscriptions USING btree (user_id);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_subscriptions_select_own ON public.user_subscriptions FOR SELECT TO authenticated USING ((user_id = auth.uid()));
-- Tier changes come from the billing edge functions (service role) only.
CREATE TRIGGER trg_user_subscriptions_updated BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- Scheduled jobs (pg_cron), verified 2026-07-20:
--   invoice-poll                  0 3 * * *    daily 03:00
--   purge-deleted-accounts-daily  15 3 * * *   daily 03:15
-- See supabase/functions/invoice-poll — daily by design; a 15-minute
-- cadence previously ran up real provider charges.
-- ════════════════════════════════════════════════════════════════
