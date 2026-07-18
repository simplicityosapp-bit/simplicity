/* ════════════════════════════════════════════════════════════════
   COMMUNITY EVENTS API — the community calendar (0092).
   ════════════════════════════════════════════════════════════════
   Any member posts an event; the creator or an admin edits/removes it. Adding
   one to "my calendar" writes a normal calendar_events row (0018) under a
   'community:<id>' google_event_id — a namespace the Google pull-sync never
   matches, so it lives on the member's in-app calendar without ever colliding
   with a real Google event. A manual push to Google is a separate, opt-in step.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const NS = 'community:'

/* created_by/id/created_at are the server's (0092 grants only content columns). */
const SERVER_OWNED = ['id', 'created_by', 'created_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* Upcoming events, soonest first — anything starting today or later. (The mock
   ignores the filter and returns them all, which is fine for preview.) */
export async function listCommunityEvents() {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('community_events')
    .select('*')
    .gte('starts_at', startOfToday.toISOString())
    .order('starts_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createCommunityEvent(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const { data, error } = await supabase.from('community_events').insert(sanitize(input)).select().single()
  if (error) throw error
  return data
}

export async function deleteCommunityEvent(id) {
  const { error } = await supabase.from('community_events').delete().eq('id', id)
  if (error) throw error
}

/* ── "Add to my calendar" — an in-app calendar_events row ────────────────────*/
export async function addEventToMyCalendar(event) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = {
    user_id: session.user.id,
    google_event_id: `${NS}${event.id}`,
    title: event.title,
    start_time: event.starts_at,
    end_time: event.ends_at ?? null,
  }
  const { error } = await supabase.from('calendar_events').insert(row)
  /* Unique (user_id, google_event_id): a double-add is a no-op, not an error. */
  if (error && error.code !== '23505') throw error
}

export async function removeEventFromMyCalendar(eventId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  /* An added event carries the community:<id> sentinel OR — once pushed to
     Google — the promoted cmt<hex> id (see the edge's retag). Delete BOTH: a
     remove that only matched community:<id> would silently hit 0 rows after an
     import, leaving the event in the calendar and letting a re-add duplicate it. */
  const gid = `cmt${eventId.replace(/-/g, '').toLowerCase()}`
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('user_id', session.user.id)
    .in('google_event_id', [`${NS}${eventId}`, gid])
  if (error) throw error
}

/* 'cmt' + 32 hex = the Google id a community event gets once pushed (see the
   edge). Reverse it back to the event uuid so an imported event still reads as
   "added". */
const G_RE = /^cmt([0-9a-f]{32})$/i
const hexToUuid = (h) => {
  const s = h.toLowerCase()
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

/* The community events this member has already added — their calendar rows,
   whether still in the community: namespace OR already promoted to a Google id
   (cmt<hex>) by a Google import. Mapped back to event ids for the "added" state
   so importing to Google doesn't flip an event back to "not added". */
export async function listMyAddedEventIds() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const { data, error } = await supabase
    .from('calendar_events')
    .select('google_event_id')
    .eq('user_id', session.user.id)
    .or(`google_event_id.like.${NS}*,google_event_id.like.cmt*`)
  if (error) throw error
  const ids = []
  for (const r of data ?? []) {
    const g = r.google_event_id
    if (typeof g !== 'string') continue
    if (g.startsWith(NS)) ids.push(g.slice(NS.length))
    else { const m = g.match(G_RE); if (m) ids.push(hexToUuid(m[1])) }
  }
  return ids
}

/* Is the member's Google Calendar connected? (Drives whether the import button
   shows.) The edge's status action answers without exposing any token. */
export async function getGoogleCalendarStatus() {
  const { data, error } = await supabase.functions.invoke('google-calendar', { body: { action: 'status' } })
  if (error) return { connected: false }
  return data?.status ?? data ?? { connected: false }
}

/* Push the given (added) community events into the member's Google Calendar via
   the edge — manual, opt-in, idempotent. Returns { ok, added, existing, failed }
   or { ok:false, reason }. */
export async function importCommunityEventsToGoogle(events) {
  const payload = (events ?? []).map((e) => ({
    id: e.id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at ?? null,
    location: e.location ?? null, description: e.description ?? null, link: e.link ?? null,
  }))
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action: 'push-community', events: payload },
  })
  if (error) throw error
  return data
}
