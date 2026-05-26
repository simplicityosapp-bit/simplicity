/* ════════════════════════════════════════════════════════════════
   LEADS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* Keep closed_at consistent with status_meta. Called on every insert
   and on every update that touches status_meta. */
function reconcileClosedAt(row) {
  if (row.status_meta === undefined) return row
  if (row.status_meta === 'in_process') return { ...row, closed_at: null }
  /* non-in_process: stamp closed_at if caller didn't provide one. */
  if (row.closed_at === undefined || row.closed_at === null) {
    return { ...row, closed_at: new Date().toISOString() }
  }
  return row
}

export async function listLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertLead(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = reconcileClosedAt(sanitize(input))
  row.user_id = session.user.id
  const { data, error } = await supabase.from('leads').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateLead(id, patch) {
  const row = reconcileClosedAt(sanitize(patch))
  const { data, error } = await supabase.from('leads').update(row).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeLead(id) {
  const { error } = await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
