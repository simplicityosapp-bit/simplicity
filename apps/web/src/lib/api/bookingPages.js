/* ════════════════════════════════════════════════════════════════
   BOOKING PAGES API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   The builder config for public appointment-booking pages (/book/<id>).
   The public page itself never reads this table — a service-role edge
   function (`booking-intake`) serves the published config, computes free
   slots, and writes bookings. Here we only manage the owner's own pages.
   Mirrors leadPages.js. */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  // Empty slug must store as NULL (the partial-unique index + format CHECK
  // treat NULL as "no slug"; '' would violate the format constraint).
  if (row.slug != null && String(row.slug).trim() === '') row.slug = null
  // Empty project_id likewise stores as NULL (uuid column).
  if (row.project_id != null && String(row.project_id).trim() === '') row.project_id = null
  return row
}

export async function listBookingPages() {
  return selectAllRows(() => supabase
    .from('booking_pages')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
}

export async function insertBookingPage(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('booking_pages').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateBookingPage(id, patch) {
  const { data, error } = await supabase
    .from('booking_pages')
    .update(sanitize(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeBookingPage(id) {
  const { error } = await supabase
    .from('booking_pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreBookingPage(id) {
  const { data, error } = await supabase
    .from('booking_pages')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
