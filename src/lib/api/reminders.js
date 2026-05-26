/* ════════════════════════════════════════════════════════════════
   REMINDERS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   Phase 1: one-off reminders (recurrence_type 'none'). Recurring
   reminders come in a later phase.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listReminders() {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .is('deleted_at', null)
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return data
}

export async function insertReminder(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('reminders').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateReminder(id, patch) {
  const { data, error } = await supabase.from('reminders').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeReminder(id) {
  const { error } = await supabase.from('reminders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
