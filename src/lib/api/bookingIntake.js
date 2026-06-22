/* ════════════════════════════════════════════════════════════════
   BOOKING INTAKE — public client for the `booking-intake` edge function.
   ════════════════════════════════════════════════════════════════
   Used by the public booking page (/book/<id>), reachable WITHOUT login.
   The edge function holds the service role; this client only carries the
   anon key (attached automatically by supabase.functions.invoke). It is
   the ONLY path the public page uses to read a page config, list open
   slots, or submit a booking — the booking_pages / bookings tables are
   never touched directly from the browser here. Mirrors leadIntake.js. */

import { supabase } from '../supabase'

/* Fetch a published page's public config (content + offered meeting types +
   timezone). Throws 'not_found' when the page is missing / unpublished /
   deleted. */
export async function fetchBookingPageConfig(pageId) {
  const { data, error } = await supabase.functions.invoke(
    `booking-intake?page=${encodeURIComponent(pageId)}`,
    { method: 'GET' },
  )
  if (error) throw new Error('not_found')
  return data
}

/* List open slots for a page + chosen meeting type, over a date range.
   `from` / `to` are YYYY-MM-DD (local to the page timezone). Returns
   { slots: [{ start, end }], timezone }. start/end are ISO timestamps. */
export async function fetchBookingSlots(pageId, meetingTypeId, from, to) {
  const params = new URLSearchParams({ page: pageId, action: 'slots', from, to })
  if (meetingTypeId) params.set('type', meetingTypeId)
  const { data, error } = await supabase.functions.invoke(
    `booking-intake?${params.toString()}`,
    { method: 'GET' },
  )
  if (error) throw error
  return data
}

/* Submit a booking. `payload` = { meetingTypeId, start, answers:{ name, phone,
   email, note, _hp } }. Returns { ok, thankYou } or throws. A 409 means the
   slot was taken between listing and submit (race) — surface "pick another". */
export async function submitBooking(pageId, payload) {
  const { data, error } = await supabase.functions.invoke('booking-intake', {
    method: 'POST',
    body: { page: pageId, ...payload },
  })
  if (error) throw error
  return data
}
