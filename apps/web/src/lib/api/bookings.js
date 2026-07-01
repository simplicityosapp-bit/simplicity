/* ════════════════════════════════════════════════════════════════
   BOOKINGS API — Supabase data access (RLS-scoped to the owner).
   ════════════════════════════════════════════════════════════════
   `bookings` rows are CREATED by the public `booking-intake` edge function
   (service role). Here the OWNER reads them and confirms / rejects:

     • confirm → create a LEAD (the person enters the CRM) + an OWNED
       calendar_event for the slot, link both onto the booking, and flip
       status → 'confirmed'. The owned event uses a sentinel
       google_event_id ('booking:<id>') so the Google-Calendar sync — which
       only ever touches ids it fetched from Google — never overwrites or
       deletes it. The slot stays held the whole time.
     • reject → status 'rejected', which frees the slot (the no-overlap
       EXCLUDE constraint only covers pending/confirmed rows).

   Auto-confirmed bookings (page.auto_confirm) arrive already 'confirmed'
   but WITHOUT a lead/event — materializeBooking() backfills those (run by
   useBookingsGeneration on home). */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'
import { callGoogleCalendar } from './integrations'
import { showToast } from '../toast'

/* Best-effort mirror of a confirmed booking to the coach's Google Calendar.
   The edge function enforces the page's write_to_google flag, so calling it
   for every confirm is safe — it no-ops (reason:'disabled') when the page
   isn't opted in, or when Google isn't connected. NEVER throws: a Google
   hiccup must not fail the local confirmation. When `notify` is set, the one
   actionable failure (token still on the old read-only scope) nudges a
   reconnect; all other outcomes stay silent. */
async function pushBookingToGoogle(bookingId, { notify = false } = {}) {
  try {
    const r = await callGoogleCalendar('push-booking', { bookingId })
    if (notify && r && r.written === false && r.reason === 'reconnect_needed') {
      showToast('כדי לכתוב תורים ליומן Google יש לחבר מחדש את היומן ב"חיבורים".', 'error')
    }
  } catch { /* best-effort — the local confirmation already succeeded */ }
}

/* Best-effort delete of a booking's Google event (on cancel). Reads the stored
   google_event_id server-side; idempotent and silent. */
async function unpushBookingFromGoogle(bookingId) {
  try { await callGoogleCalendar('unpush-booking', { bookingId }) } catch { /* best-effort */ }
}

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listBookings() {
  return selectAllRows(() => supabase
    .from('bookings')
    .select('*')
    .order('starts_at', { ascending: true }))
}

export async function updateBooking(id, patch) {
  const { data, error } = await supabase.from('bookings').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

async function requireUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  return session.user.id
}

/* Create the lead + owned calendar_event for a booking. Idempotent-ish:
   the caller only invokes this for bookings that don't yet carry a lead/
   event. Returns { lead_id, event_id }. */
async function createLeadAndEvent(booking, userId) {
  const today = new Date().toISOString().slice(0, 10)
  const noteParts = []
  if (booking.note) noteParts.push(booking.note)
  noteParts.push('נקבע דרך דף קביעת פגישות')

  const { data: lead, error: leadErr } = await supabase.from('leads').insert({
    user_id: userId,
    name: booking.name || 'פנייה מהדף',
    phone: booking.phone || null,
    email: booking.email || null,
    notes: noteParts.join(' · '),
    status: 'new',
    status_meta: 'in_process',
    inquiry_date: today,
  }).select('id').single()
  if (leadErr) throw leadErr

  const duration = Math.max(1, Math.round((new Date(booking.ends_at) - new Date(booking.starts_at)) / 60000))
  const { data: ev, error: evErr } = await supabase.from('calendar_events').insert({
    user_id: userId,
    google_event_id: `booking:${booking.id}`, // sentinel — never seen by the Google sync
    title: booking.name || 'פגישה',
    start_time: booking.starts_at,
    end_time: booking.ends_at,
    all_day: false,
    duration_minutes: duration,
    owned: true,            // frozen against the Google sync (migration 0023)
    matched_manually: true, // keep the lead link
    confidence_score: 1,
    lead_id: lead.id,
  }).select('id').single()
  if (evErr) {
    // No transaction across the two inserts: if the event fails we must undo
    // the lead, otherwise the booking stays unlinked and the next retry
    // (materializeBooking runs in a loop on home) creates a DUPLICATE lead.
    await supabase.from('leads').delete().eq('id', lead.id)
    throw evErr
  }

  return { lead_id: lead.id, event_id: ev.id }
}

/* Manual approve: convert + flip to confirmed, then mirror to Google (if the
   page opted in). The Google write is awaited so a stale-scope account gets a
   one-time "reconnect" nudge, but it never blocks the confirmation. */
export async function confirmBooking(booking) {
  const userId = await requireUserId()
  const { lead_id, event_id } = await createLeadAndEvent(booking, userId)
  const row = await updateBooking(booking.id, { status: 'confirmed', lead_id, event_id })
  await pushBookingToGoogle(row.id, { notify: true })
  return row
}

/* Backfill an already-confirmed (auto) booking that has no lead/event yet.
   Runs in a loop on home, so the Google mirror here is fire-and-forget +
   silent (no per-row toasts). */
export async function materializeBooking(booking) {
  if (booking.lead_id && booking.event_id) return booking
  const userId = await requireUserId()
  const { lead_id, event_id } = await createLeadAndEvent(booking, userId)
  const row = await updateBooking(booking.id, { lead_id, event_id })
  pushBookingToGoogle(row.id)
  return row
}

/* Reject (frees the slot). Applies to PENDING bookings (before any Google
   event exists), so there's nothing to delete from Google. The created lead/
   event (if any) are NOT removed — rejection just declines the appointment. */
export async function rejectBooking(id) {
  return updateBooking(id, { status: 'rejected' })
}

/* Cancel a CONFIRMED booking: delete its Google event (if written) and flip
   status → 'cancelled', which frees the slot via the no-overlap constraint.
   The local owned calendar_event is removed by the caller through the
   calendar's own cache-aware deleteEvent. The lead stays in the CRM. */
export async function cancelBooking(booking) {
  await unpushBookingFromGoogle(booking.id)
  return updateBooking(booking.id, { status: 'cancelled' })
}
