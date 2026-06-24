/* ════════════════════════════════════════════════════════════════
   BOOKING PAGE SCHEMA — shared contract for the builder + public page.
   ════════════════════════════════════════════════════════════════
   Sibling of leadPageSchema.js. Defines the availability model, content
   defaults, and helpers. The `booking-intake` edge function (Deno) holds
   its own copy of the slot-generation logic — keep the availability shape
   here in sync with it.

   Surface styling (background / glass / brand colour) is shared verbatim
   with lead pages via leadPageSurface(), so the booking page looks like a
   first-class Simplicity public page. */

import {
  DEFAULT_BRAND_COLOR, LEAD_PAGE_BACKGROUNDS, leadPageBgUrl,
  leadPageSurface, normalizeSlug, isValidSlug, slugifyInput, safeRedirectUrl,
} from './leadPageSchema'

/* Re-export the shared bits so booking screens import from one place. */
export {
  DEFAULT_BRAND_COLOR, LEAD_PAGE_BACKGROUNDS, leadPageBgUrl,
  leadPageSurface, normalizeSlug, isValidSlug, slugifyInput, safeRedirectUrl,
}

/* Hebrew weekday labels, index 0=Sunday … 6=Saturday (JS getDay order). */
export const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/* Branding + copy — same contract as lead_pages.content. */
export const DEFAULT_CONTENT = {
  logoText: '',
  heading: 'קביעת פגישה',
  body: '',
  brandColor: DEFAULT_BRAND_COLOR,
  background: '',      // '' = default gradient; else a Simplicity scene key
  cardOpacity: 100,
  cardBlur: 14,
  cardRadius: 24,      // px — card corner roundness (24 = the original look)
  bold: false,
  textColor: 'dark',
  textAlign: 'start',
  thankYou: {
    mode: 'message', // 'message' | 'redirect'
    message: 'תודה! הפגישה נקבעה. נחזור אליכם לאישור סופי בהקדם.',
    url: '',
  },
}

/* The scheduling rules. weekly is keyed by JS getDay() (0=Sun..6=Sat); each
   day holds an ordered list of { start, end } windows in "HH:MM" local time.
   Default = the Israeli work week, Sun–Thu 09:00–17:00. */
export const DEFAULT_AVAILABILITY = {
  timezone: 'Asia/Jerusalem',
  slotMinutes: 30,             // granularity of offered start times
  bufferMinutes: 0,            // gap kept clear after each appointment
  minNoticeHours: 12,          // earliest bookable time from "now"
  maxDaysAhead: 30,            // how far ahead the calendar opens
  defaultDurationMinutes: 50,  // fallback when a meeting type has no duration
  weekly: {
    0: [{ start: '09:00', end: '17:00' }],
    1: [{ start: '09:00', end: '17:00' }],
    2: [{ start: '09:00', end: '17:00' }],
    3: [{ start: '09:00', end: '17:00' }],
    4: [{ start: '09:00', end: '17:00' }],
    5: [],
    6: [],
  },
}

/* A fresh page's starting config (before the coach edits anything). */
export const newBookingPageDraft = () => ({
  title: '',
  published: false,
  auto_confirm: false,
  project_id: '',
  slug: '',
  // Phase 6 — per-page Google Calendar write opt-in (both off by default).
  write_to_google: false,
  invite_client: false,
  content: structuredClone(DEFAULT_CONTENT),
  availability: structuredClone(DEFAULT_AVAILABILITY),
  meeting_type_ids: [],
  meeting_type_durations: {},
})

/* "HH:MM" → minutes since midnight (NaN-safe). */
export const hmToMinutes = (hm) => {
  const [h, m] = String(hm || '').split(':').map((n) => parseInt(n, 10))
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/* Clamp the numeric availability fields to sane minimums, replacing empty /
   NaN inputs (a cleared <input type="number"> yields Number('')===0) with the
   schema default. Returns a NEW availability object; never mutates. Without
   this, slotMinutes:0 / maxDaysAhead:0 can be saved and break public slot
   generation. */
const clampInt = (v, min, fallback) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= min ? n : fallback
}
export const sanitizeAvailability = (av) => {
  const a = av || {}
  return {
    ...a,
    slotMinutes: clampInt(a.slotMinutes, 5, DEFAULT_AVAILABILITY.slotMinutes),
    defaultDurationMinutes: clampInt(a.defaultDurationMinutes, 5, DEFAULT_AVAILABILITY.defaultDurationMinutes),
    bufferMinutes: clampInt(a.bufferMinutes, 0, DEFAULT_AVAILABILITY.bufferMinutes),
    minNoticeHours: clampInt(a.minNoticeHours, 0, DEFAULT_AVAILABILITY.minNoticeHours),
    maxDaysAhead: clampInt(a.maxDaysAhead, 1, DEFAULT_AVAILABILITY.maxDaysAhead),
  }
}

/* Find the first weekly window whose start is not strictly before its end
   (e.g. 17:00–09:00, which yields zero or broken slots). Returns { day } of
   the offending window, or null when every window is valid. */
export const findInvalidWindow = (av) => {
  const weekly = av?.weekly || {}
  for (let day = 0; day < 7; day += 1) {
    const windows = Array.isArray(weekly[day]) ? weekly[day] : []
    for (const w of windows) {
      if (hmToMinutes(w.start) >= hmToMinutes(w.end)) return { day }
    }
  }
  return null
}

/* The duration (minutes) of a meeting type, falling back to the page default. */
export const durationFor = (meetingType, availability) => {
  const d = meetingType?.duration_minutes
  if (Number.isFinite(d) && d > 0) return d
  const def = availability?.defaultDurationMinutes
  return Number.isFinite(def) && def > 0 ? def : 50
}

/* Public URL for a page. Pass the slug when set, else the uuid — both resolve
   at /book/<x> (the edge fn matches a uuid OR a slug). Absolute so it's
   shareable / copyable. SEPARATE namespace from /lead/<x>. */
export const publicBookingPageUrl = (slugOrId) => `${window.location.origin}/book/${slugOrId}`
