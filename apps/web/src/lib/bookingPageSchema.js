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

/* Localized weekday labels, index 0=Sunday … 6=Saturday (JS getDay order).
   Resolves via the calendar namespace (weekdayLabels()) so the weekly editor
   follows the active language; he keeps the original full names. */
export { weekdayNamesLong as weekdayLabels } from '@simplicity/core'

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

/* No days open. A new page starts here.

   DEFAULT_AVAILABILITY.weekly used to be handed to every new page, which meant
   a page could go live offering Sunday–Thursday 09:00–17:00 that nobody had
   ever agreed to: a coach who works Tuesday and Wednesday evenings published
   hours invented for them, and only a client booking the wrong slot would find
   out. So the work week stops being an assumption and becomes an offer —
   WORKWEEK_WEEKLY is one press away in the editor, and taking it is a choice. */
export const EMPTY_WEEKLY = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }

/* The Israeli work week, as a preset. Same shape the schema always shipped. */
export const WORKWEEK_WEEKLY = DEFAULT_AVAILABILITY.weekly

/* Apply the preset. Clones — WORKWEEK_WEEKLY is a reference to the module's own
   constant, and handing it out live would let one page's edits rewrite the
   preset for every page after it, in the same process. */
export const applyWorkweek = (av) => ({ ...(av || {}), weekly: structuredClone(WORKWEEK_WEEKLY) })

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
  availability: { ...structuredClone(DEFAULT_AVAILABILITY), weekly: structuredClone(EMPTY_WEEKLY) },
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

/* Find the first weekday whose windows are ALL too short to hold the shortest
   meeting the page offers — a day that will produce no bookable time at all.
   booking-intake only offers a start time when the whole meeting fits inside one
   window (`min + duration <= windowEnd`), so a 09:00–09:30 window offers nothing
   against a 60-minute meeting. Nothing said so: the page published, the visitor
   met an empty calendar, and the owner had no way to know.

   A day with SOME short windows is fine — the others still produce slots — so
   only a day that cannot produce a single one is reported. Returns
   { day, longest } (longest = that day's best window, for the message), or null.
   `shortestMeeting` comes from offeredDurations() in the builder. */
export const findUnbookableDay = (av, shortestMeeting) => {
  const weekly = av?.weekly || {}
  if (!Number.isFinite(shortestMeeting) || shortestMeeting <= 0) return null
  for (let day = 0; day < 7; day += 1) {
    const windows = Array.isArray(weekly[day]) ? weekly[day] : []
    if (!windows.length) continue                    // a closed day is a choice, not a fault
    const lengths = windows.map((w) => hmToMinutes(w.end) - hmToMinutes(w.start))
    const longest = Math.max(...lengths)
    if (longest < shortestMeeting) return { day, longest }
  }
  return null
}

/* ── Copying one day's hours onto others ────────────────────────────────────
   A coach who works Sunday to Thursday sets the same hours five times, one
   time field at a time. This is the shortcut.

   One day's hours as a sentence — "09:00–17:00", or "09:00–12:00, 16:00–19:00"
   for a split day. A closed day returns '' rather than a word, because only the
   caller knows which language to say "closed" in. */
export const describeWindows = (windows) =>
  (Array.isArray(windows) ? windows : [])
    .filter((w) => w?.start && w?.end)
    .map((w) => `${w.start}–${w.end}`)
    .join(', ')

/* Copy fromDay's windows onto each of toDays, REPLACING whatever they held —
   the dialog shows what is about to be replaced, so the destructive half is
   the coach's decision, not a surprise.

   Each target gets its OWN copy of each window. Handing them the same objects
   would look right and then betray: editing Monday's start time would silently
   move Sunday's too, because they would be one object wearing two names.
   Returns a NEW weekly map; never mutates. */
export const copyDayWindows = (weekly, fromDay, toDays) => {
  const source = Array.isArray(weekly?.[fromDay]) ? weekly[fromDay] : []
  const next = { ...(weekly || {}) }
  for (const day of toDays || []) {
    if (String(day) === String(fromDay)) continue     // copying onto itself is a no-op, not a wipe
    next[day] = source.map((w) => ({ ...w }))
  }
  return next
}

/* ── Builder preview ────────────────────────────────────────────────────────
   The times a given weekday CAN offer, for the builder's preview only.

   Deliberately clock-arithmetic, never absolute instants: the edge function owns
   real slot generation (timezones, DST, existing bookings, calendar busy time),
   and a second implementation of that would be a second source of truth waiting
   to disagree. This answers the narrower question the builder actually needs —
   "given these hours and this meeting length, what start times exist at all?" —
   using the same fit rule the edge applies (`start + duration <= windowEnd`).

   What it therefore does NOT know: which of those times are already taken. The
   preview says so on screen. */
export const previewDayTimes = (av, durationMinutes, weekday) => {
  const weekly = av?.weekly || {}
  const windows = Array.isArray(weekly[weekday]) ? weekly[weekday]
    : (Array.isArray(weekly[String(weekday)]) ? weekly[String(weekday)] : [])
  const dur = Number(durationMinutes) > 0 ? Number(durationMinutes) : 0
  const step = clampInt(av?.slotMinutes, 5, DEFAULT_AVAILABILITY.slotMinutes)
  if (!dur || !windows.length) return []
  const out = []
  for (const w of windows) {
    const start = hmToMinutes(w?.start)
    const end = hmToMinutes(w?.end)
    if (!(end > start)) continue
    for (let m = start; m + dur <= end; m += step) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0')
      const mm = String(m % 60).padStart(2, '0')
      out.push(`${hh}:${mm}`)
    }
  }
  return [...new Set(out)].sort()
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
