-- ════════════════════════════════════════════════════════════════
-- Migration 0052 — Booking Pages (public self-service appointment booking)
-- Date: 2026-06-22
-- ════════════════════════════════════════════════════════════════
-- A coach builds a public booking page (its own link /book/<slug>, and/or
-- embedded at the foot of a lead page). A visitor picks a meeting type, a
-- free day, an open slot, fills their details, and books. The public page
-- NEVER touches the DB directly — a service-role edge function
-- (`booking-intake`) maps page → user_id, computes free slots, validates,
-- and inserts a booking. Therefore `booking_pages` / `bookings` stay
-- OWNER-ONLY at the RLS level (no anon access).
--
-- A new booking lands as status='pending' and surfaces in "דורש תשומת לב"
-- + the calendar, entering nothing else until the coach confirms — UNLESS
-- the page has `auto_confirm = true`. A pending OR confirmed booking HOLDS
-- its time slot (so a second visitor cannot grab it); reject/cancel frees it.
-- On confirm the booking becomes a real lead + an owned calendar_event
-- (and, later, a Google Calendar event).
--
-- This MIRRORS the lead_pages architecture (see 0046 / 0048).
--
-- Additive + data-preserving:
--   • two new tables (no existing data).
--   • one new nullable column on meeting_types (`duration_minutes`).
--     Existing types get NULL → the booking page supplies a default; nothing
--     downstream changes (the billing engine never reads this column).
--   No column or table is dropped or rewritten. Re-running is a no-op
--   (IF NOT EXISTS / DROP-then-CREATE on policies + triggers).
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the `booking-intake`
-- edge function — the function reads booking_pages and writes bookings.
-- ════════════════════════════════════════════════════════════════

-- Needed for the no-overlap EXCLUDE constraint (gist index over uuid = + range &&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 0) meeting_types: per-type default duration ─────────────────────────────
-- NULL = no preset duration → the booking page falls back to its own default.
ALTER TABLE meeting_types
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- ── 1) booking_pages — the builder config, one row per public page ──────────
CREATE TABLE IF NOT EXISTS booking_pages (
  id           uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid NOT NULL,
  -- internal name the coach uses to identify the page (not shown publicly)
  title        text NOT NULL DEFAULT '',
  -- draft vs live. A non-published page returns 404 from the edge function.
  published    boolean NOT NULL DEFAULT false,
  -- skip the manual-approval gate: bookings are confirmed on arrival.
  auto_confirm boolean NOT NULL DEFAULT false,
  -- short readable public link (/book/<slug>); NULL → use the uuid.
  slug         text,
  -- branding + copy: { logoText, heading, body, brandColor, background,
  --   cardOpacity, cardBlur, bold, textColor, textAlign,
  --   thankYou:{ mode:'message'|'redirect', message, url } }
  -- SAME contract as lead_pages.content (reuses leadPageSurface()).
  content      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- scheduling rules: {
  --   timezone:'Asia/Jerusalem',
  --   slotMinutes:30, bufferMinutes:0, minNoticeHours:12, maxDaysAhead:30,
  --   defaultDurationMinutes:50,
  --   weekly:{ "0":[{start:'09:00',end:'17:00'}], ... "6":[] }  // 0=Sun..6=Sat
  -- }
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ordered meeting-type ids this page offers (subset of meeting_types):
  --   ["uuid", "uuid", ...]
  meeting_type_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- bookings inherit this project for attribution (like lead_pages).
  project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at   timestamp with time zone,
  CONSTRAINT booking_pages_pkey PRIMARY KEY (id),
  CONSTRAINT booking_pages_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Slug format guard: lowercase letters/digits/hyphens, 3–40 chars, no
-- leading/trailing hyphen. NULL always passes. (Mirrors lead_pages 0048.)
ALTER TABLE booking_pages DROP CONSTRAINT IF EXISTS booking_pages_slug_format;
ALTER TABLE booking_pages ADD CONSTRAINT booking_pages_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

CREATE INDEX IF NOT EXISTS idx_booking_pages_user ON public.booking_pages (user_id);
-- Case-insensitive uniqueness among non-deleted pages (separate namespace
-- from lead_pages: /book/<slug> ≠ /lead/<slug>).
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_pages_slug_unique
  ON public.booking_pages (lower(slug))
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE booking_pages ENABLE ROW LEVEL SECURITY;

-- Owner-only. Published pages are reached exclusively through the service-role
-- edge function, so there is intentionally NO anon/public policy.
DROP POLICY IF EXISTS booking_pages_own ON booking_pages;
CREATE POLICY booking_pages_own ON booking_pages
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_booking_pages_updated ON public.booking_pages;
CREATE TRIGGER trg_booking_pages_updated
  BEFORE UPDATE ON public.booking_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2) bookings — one row per submitted appointment ─────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              uuid DEFAULT gen_random_uuid() NOT NULL,
  -- the page that produced this booking (kept on page delete for history).
  page_id         uuid REFERENCES booking_pages(id) ON DELETE SET NULL,
  -- the OWNER (coach). Comes ONLY from the page row server-side — never
  -- client-supplied — so a submitter can never forge it.
  user_id         uuid NOT NULL,
  -- chosen meeting type (SET NULL if the type is later hard-deleted).
  meeting_type_id uuid REFERENCES meeting_types(id) ON DELETE SET NULL,
  -- visitor details
  name            text NOT NULL,
  phone           text,
  email           text,
  note            text,
  -- any extra free fields the page declared
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- the booked window (local time stored as timestamptz)
  starts_at       timestamp with time zone NOT NULL,
  ends_at         timestamp with time zone NOT NULL,
  -- pending = awaiting confirmation (still HOLDS the slot)
  -- confirmed = approved (holds the slot, has a calendar_event)
  -- rejected / cancelled = frees the slot
  status          text NOT NULL DEFAULT 'pending',
  -- filled on confirm:
  lead_id         uuid REFERENCES leads(id) ON DELETE SET NULL,
  event_id        uuid REFERENCES calendar_events(id) ON DELETE SET NULL,
  -- filled when the appointment is written to the coach's Google Calendar
  google_event_id text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bookings_pkey PRIMARY KEY (id),
  CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT bookings_status_chk
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
  CONSTRAINT bookings_window_chk CHECK (ends_at > starts_at),
  -- ATOMIC double-booking guard: no two ACTIVE (pending/confirmed) bookings
  -- for the same coach may overlap in time. The DB rejects the race that two
  -- visitors grabbing the same slot would otherwise win.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_user        ON public.bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_page        ON public.bookings (page_id);
-- The availability calc + calendar read the active window range a lot.
CREATE INDEX IF NOT EXISTS idx_bookings_user_starts ON public.bookings (user_id, starts_at);
-- The attention widget queries only the few pending rows → keep it tiny.
CREATE INDEX IF NOT EXISTS idx_bookings_pending
  ON public.bookings (user_id) WHERE status = 'pending';

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Owner-only. Visitors create bookings exclusively via the service-role edge
-- function (which sets user_id from the page), so there is NO anon policy.
DROP POLICY IF EXISTS bookings_own ON bookings;
CREATE POLICY bookings_own ON bookings
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_bookings_updated ON public.bookings;
CREATE TRIGGER trg_bookings_updated
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
