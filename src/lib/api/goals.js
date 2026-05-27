/* ════════════════════════════════════════════════════════════════
   GOALS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listGoals() {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertGoal(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('goals').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateGoal(id, patch) {
  const { data, error } = await supabase.from('goals').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeGoal(id) {
  const { error } = await supabase.from('goals').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedGoals() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function restoreGoal(id) {
  const { data, error } = await supabase
    .from('goals')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
