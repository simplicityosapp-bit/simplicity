/* ════════════════════════════════════════════════════════════════
   LEAD STATUSES API — per-user sub-statuses under the 4 fixed meta
   categories (in_process / converted / not_relevant / ghost). D24.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listLeadStatuses() {
  const { data, error } = await supabase
    .from('lead_statuses')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  /* Sort by sort_order CLIENT-SIDE (not in the query): the column is
     added by migration 0009, and ordering by a non-existent column makes
     PostgREST return 400 — which would wipe out ALL sub-statuses on any
     DB where 0009 hasn't run yet. Missing/!null sort_order → 0. */
  return [...(data || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
}

export async function insertLeadStatus(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('lead_statuses').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateLeadStatus(id, patch) {
  const { data, error } = await supabase.from('lead_statuses').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeLeadStatus(id) {
  const { error } = await supabase.from('lead_statuses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/* Trash — sub-statuses soft-deleted in the last 30 days + restore. */
export async function listDeletedLeadStatuses() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data, error } = await supabase
    .from('lead_statuses')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function restoreLeadStatus(id) {
  const { data, error } = await supabase
    .from('lead_statuses')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/* Count live leads currently assigned to a given sub-status. */
export async function countLeadsByStatus(statusId) {
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status_id', statusId)
    .is('deleted_at', null)
  if (error) throw error
  return count || 0
}

/* Reassign leads from one sub-status to another (or null to clear). */
export async function reassignLeadsStatus(fromId, toId) {
  const { error } = await supabase
    .from('leads')
    .update({ status_id: toId })
    .eq('status_id', fromId)
    .is('deleted_at', null)
  if (error) throw error
}
