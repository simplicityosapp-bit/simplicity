/* ════════════════════════════════════════════════════════════════
   PROJECTS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertProject(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('projects').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateProject(id, patch) {
  const { data, error } = await supabase.from('projects').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeProject(id) {
  const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
