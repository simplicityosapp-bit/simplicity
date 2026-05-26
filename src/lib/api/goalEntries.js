/* ════════════════════════════════════════════════════════════════
   GOAL ENTRIES API — manual progress entries (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   An entry belongs to a category (not a single goal); the moon engine
   sums a category's entries within each goal's period.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listGoalEntries() {
  const { data, error } = await supabase
    .from('goal_entries')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function insertGoalEntry(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('goal_entries').insert(row).select().single()
  if (error) throw error
  return data
}

export async function removeGoalEntry(id) {
  const { error } = await supabase.from('goal_entries').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
