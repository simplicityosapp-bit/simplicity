/* ════════════════════════════════════════════════════════════════
   GROUPS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   A group is a multi-client session series under a project (e.g.,
   a weekly workshop). It carries the package price + session count.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertGroup(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('groups').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateGroup(id, patch) {
  const { data, error } = await supabase.from('groups').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeGroup(id) {
  const { error } = await supabase.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedGroups() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function restoreGroup(id) {
  const { data, error } = await supabase
    .from('groups')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
