/* ════════════════════════════════════════════════════════════════
   GENERATORS — the rows the app owes, written from the phone too.
   ════════════════════════════════════════════════════════════════
   Mirrors web screens/home/HomeGenerators.jsx. Three engines turn something
   scheduled into real rows:

     · scheduled meetings — a client's or group's weekly slot → pending
       scheduled_meetings (core generateScheduledMeetings)
     · recurring engine  — templates → pending transactions
       (core generateRecurringTransactions)
     · bookings          — an auto-confirmed booking → a lead and an owned
       calendar event (port of web lib/api/bookings materializeBooking)

   Until this existed only the browser ran them. A coach who worked from the
   phone alone never got the pending income a recurring rule promises, never
   saw an auto-confirmed booking become a lead, and got meetings only from
   the nightly cron. Both apps writing is safe for the reason two browser
   tabs always were: every engine is idempotent against what exists, and the
   database's unique indexes turn a true duplicate away as 23505, which a
   pass reads as "already there".

   The rules the web hooks keep, kept here:
     · never generate from partial data — any failed read aborts the whole
       pass, because an empty list reads as "nothing exists yet" and every
       slot would be created again;
     · meetings before transactions, so an on_meeting rule sees the meetings
       this same pass just created;
     · recurring rows are written oldest-first and the pass stops at the
       first failed insert (core recurring.ts: the walk starts after the
       newest row, so a gap behind a later row would never be revisited).

   `client` is passed in rather than imported so a pass can be tested
   against a fake backend.
   ════════════════════════════════════════════════════════════════ */

import { generateRecurringTransactions, generateScheduledMeetings } from '@simplicity/core'
import { selectAll } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at']
const isDuplicate = (error) => error?.code === '23505'

/* At most one pass per this long, however often the app comes back to the
   foreground. Every engine is idempotent, so this only saves reads. */
export const MIN_INTERVAL_MS = 5 * 60 * 1000

export function isDue(lastRunAt, now, minInterval = MIN_INTERVAL_MS) {
  return lastRunAt == null || now - lastRunAt >= minInterval
}

/* Every row of a table, or a throw. Ordered by id so the pages of a large
   table neither overlap nor skip a row between two range reads. */
async function readAll(client, table, { live = true, narrow } = {}) {
  const { data, error } = await selectAll(() => {
    let q = client.from(table).select('*')
    if (live) q = q.is('deleted_at', null)
    if (narrow) q = narrow(q)
    return q.order('id', { ascending: true })
  })
  if (error) throw error
  return data ?? []
}

function insertRow(client, table, payload, userId) {
  const row = { ...payload }
  SERVER_OWNED.forEach((k) => delete row[k])
  row.user_id = userId
  return client.from(table).insert(row).select().single()
}

/* Create the lead + owned calendar_event for a booking. Same rows, same
   wording, same undo-the-lead-if-the-event-fails as web — without that undo
   the booking stays unlinked and the next pass makes a DUPLICATE lead. */
async function createLeadAndEvent(client, booking, userId) {
  const today = new Date().toISOString().slice(0, 10)
  const noteParts = []
  if (booking.note) noteParts.push(booking.note)
  noteParts.push('נקבע דרך דף קביעת פגישות')

  const { data: lead, error: leadErr } = await client.from('leads').insert({
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
  const { data: ev, error: evErr } = await client.from('calendar_events').insert({
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
    await client.from('leads').delete().eq('id', lead.id)
    throw evErr
  }
  return { lead_id: lead.id, event_id: ev.id }
}

export async function materializeBooking(client, booking, userId) {
  if (booking.lead_id && booking.event_id) return booking
  const { lead_id, event_id } = await createLeadAndEvent(client, booking, userId)
  const { data, error } = await client.from('bookings').update({ lead_id, event_id }).eq('id', booking.id).select().single()
  if (error) throw error
  /* Mirror to Google if the page opted in. The function no-ops when it did
     not, or when Google is not connected. Fire-and-forget, as on web. */
  Promise.resolve(client.functions.invoke('google-calendar', { body: { action: 'push-booking', bookingId: booking.id } })).catch(() => {})
  return data
}

/* One pass over all three engines. Throws only when a READ failed — and then
   before anything was written. Insert failures are counted in `failed`. */
export async function runGenerationPass(client, now = new Date()) {
  const result = { meetings: 0, transactions: 0, bookings: 0, failed: 0 }
  const { data } = await client.auth.getSession()
  const userId = data?.session?.user?.id
  if (!userId) return result

  const [clients, groups, members, meetings, templates, transactions, bookings] = await Promise.all([
    readAll(client, 'clients'),
    readAll(client, 'groups'),
    readAll(client, 'group_members'),
    readAll(client, 'scheduled_meetings', { live: false }),
    readAll(client, 'recurring_templates'),
    // The engine only ever looks at rows a template produced.
    readAll(client, 'transactions', { narrow: (q) => q.not('recurring_id', 'is', null) }),
    readAll(client, 'bookings', { live: false, narrow: (q) => q.eq('status', 'confirmed').is('event_id', null) }),
  ])

  const allMeetings = [...meetings]
  for (const payload of generateScheduledMeetings(clients, groups, meetings, now, { members })) {
    const { data: saved, error } = await insertRow(client, 'scheduled_meetings', payload, userId)
    if (error) {
      if (!isDuplicate(error)) result.failed += 1
      continue
    }
    result.meetings += 1
    if (saved) allMeetings.push(saved)
  }

  for (const payload of generateRecurringTransactions(templates, transactions, now, allMeetings)) {
    const { error } = await insertRow(client, 'transactions', payload, userId)
    if (!error) { result.transactions += 1; continue }
    if (isDuplicate(error)) continue
    result.failed += 1
    break // never write past a gap — see the note at the top
  }

  for (const booking of bookings) {
    if (booking.status !== 'confirmed' || booking.event_id) continue
    try {
      await materializeBooking(client, booking, userId)
      result.bookings += 1
    } catch {
      result.failed += 1
    }
  }

  return result
}

/* Screens that show generated rows listen here, so a pass that lands after
   their first load shows up now rather than on the next focus. */
const listeners = new Set()

export function onGenerated(cb) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function notifyGenerated(result) {
  listeners.forEach((cb) => {
    try { cb(result) } catch { /* one screen's refresh must not stop another's */ }
  })
}
