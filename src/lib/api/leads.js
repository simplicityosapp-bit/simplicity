/* ════════════════════════════════════════════════════════════════
   LEADS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { insertLeadStatusLog } from './leadStatusLog'

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

/* `source` defaults to 'manual_select' (form-based create). Future
   callers (drag-to-column, convert flow, auto-expire job) override. */
export async function insertLead(input, { source = 'manual_select' } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = reconcileClosedAt(sanitize(input))
  row.user_id = session.user.id
  const { data, error } = await supabase.from('leads').insert(row).select().single()
  if (error) throw error
  /* Open the status log with the first entry — only possible when a
     sub-status was selected (to_status_id NOT NULL in schema). Skip
     silently otherwise; the seed step can fill in later. */
  if (data?.id && data?.status_id) {
    insertLeadStatusLog({
      leadId: data.id,
      fromStatusId: null,
      toStatusId: data.status_id,
      source,
    }).catch(() => { /* non-fatal */ })
  }
  return data
}

export async function updateLead(id, patch, { source = 'manual_select' } = {}) {
  const cleanPatch = reconcileClosedAt(sanitize(patch))
  /* If status_id is being touched, read the old value first so we can
     log the transition. Skip when status_id isn't in the patch to save
     a round-trip. */
  let oldStatusId = null
  if (cleanPatch.status_id !== undefined) {
    const { data: prev } = await supabase
      .from('leads').select('status_id').eq('id', id).maybeSingle()
    oldStatusId = prev?.status_id || null
  }
  const { data, error } = await supabase.from('leads').update(cleanPatch).eq('id', id).select().single()
  if (error) throw error
  const newStatusId = cleanPatch.status_id ?? undefined
  if (newStatusId !== undefined && newStatusId !== oldStatusId && newStatusId) {
    insertLeadStatusLog({
      leadId: id,
      fromStatusId: oldStatusId,
      toStatusId: newStatusId,
      source,
    }).catch(() => { /* non-fatal */ })
  }
  return data
}

export async function removeLead(id) {
  const { error } = await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
