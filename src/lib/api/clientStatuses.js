/* ════════════════════════════════════════════════════════════════
   CLIENT STATUSES API — per-user sub-statuses under the 4 fixed
   meta categories (active / wandering / past / no_status). D18.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listClientStatuses() {
  return selectAllRows(() => supabase.from('client_statuses').select('*').is('deleted_at', null).order('created_at', { ascending: true }))
}

export async function insertClientStatus(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('client_statuses').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateClientStatus(id, patch) {
  const { data, error } = await supabase.from('client_statuses').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeClientStatus(id) {
  const { error } = await supabase.from('client_statuses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/* Count live clients currently assigned to a given sub-status. */
export async function countClientsByStatus(statusId) {
  const { count, error } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('status_id', statusId)
    .is('deleted_at', null)
  if (error) throw error
  return count || 0
}

/* Reassign clients from one sub-status to another (or null to clear). */
export async function reassignClientsStatus(fromId, toId) {
  const { error } = await supabase
    .from('clients')
    .update({ status_id: toId })
    .eq('status_id', fromId)
    .is('deleted_at', null)
  if (error) throw error
}

/* Reassign a SPECIFIC set of clients (by id) to a sub-status — used by
   undo to move back exactly the clients a delete had reassigned. */
export async function reassignClientsStatusByIds(ids, toId) {
  if (!ids?.length) return
  const { error } = await supabase.from('clients').update({ status_id: toId }).in('id', ids)
  if (error) throw error
}

/* Soft-delete restore — clears deleted_at (mirrors the lead-status one). */
export async function restoreClientStatus(id) {
  const { data, error } = await supabase
    .from('client_statuses')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
