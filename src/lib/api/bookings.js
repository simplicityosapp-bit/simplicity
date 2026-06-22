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
  if (evErr) throw evErr

  return { lead_id: lead.id, event_id: ev.id }
}

/* Manual approve: convert + flip to confirmed. */
export async function confirmBooking(booking) {
  const userId = await requireUserId()
  const { lead_id, event_id } = await createLeadAndEvent(booking, userId)
  return updateBooking(booking.id, { status: 'confirmed', lead_id, event_id })
}

/* Backfill an already-confirmed (auto) booking that has no lead/event yet. */
export async function materializeBooking(booking) {
  if (booking.lead_id && booking.event_id) return booking
  const userId = await requireUserId()
  const { lead_id, event_id } = await createLeadAndEvent(booking, userId)
  return updateBooking(booking.id, { lead_id, event_id })
}

/* Reject (frees the slot). The created lead/event (if any) are NOT removed —
   rejection just declines the appointment; cleanup is the owner's call. */
export async function rejectBooking(id) {
  return updateBooking(id, { status: 'rejected' })
}
