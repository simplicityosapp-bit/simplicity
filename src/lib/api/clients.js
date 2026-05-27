/* ════════════════════════════════════════════════════════════════
   CLIENTS API — Supabase data access for the clients table.
   RLS scopes every row to the signed-in user (user_id = auth.uid()).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { insertClientStatusLog } from './clientStatusLog'

/* Columns the DB owns — never send these on insert/update. */
const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']

function sanitize(input) {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* All live clients for the current user, newest first. */
export async function listClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertClient(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('clients').insert(row).select().single()
  if (error) throw error
  /* Open the status log with the first entry — never fails the insert
     itself, just gets best-effort logged. */
  if (data?.id && data?.status_meta) {
    insertClientStatusLog({
      clientId: data.id,
      oldStatus: null,
      newStatus: data.status_meta,
    }).catch(() => { /* non-fatal */ })
  }
  return data
}

export async function updateClient(id, patch) {
  const cleanPatch = sanitize(patch)
  /* If status_meta is being touched, read the old value first so we
     can log the transition. Skipping the read when meta isn't in the
     patch saves a round-trip. */
  let oldMeta = null
  if (cleanPatch.status_meta !== undefined) {
    const { data: prev } = await supabase
      .from('clients').select('status_meta').eq('id', id).maybeSingle()
    oldMeta = prev?.status_meta || null
  }
  const { data, error } = await supabase.from('clients').update(cleanPatch).eq('id', id).select().single()
  if (error) throw error
  if (cleanPatch.status_meta !== undefined && cleanPatch.status_meta !== oldMeta) {
    insertClientStatusLog({
      clientId: id,
      oldStatus: oldMeta,
      newStatus: cleanPatch.status_meta,
    }).catch(() => { /* non-fatal */ })
  }
  return data
}

/* Soft delete — sets deleted_at; row stays for the 30-day trash window. */
export async function removeClient(id) {
  const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/* Deleted-but-recoverable clients: only those soft-deleted in the last
   30 days (older rows are eligible for hard-delete and stay hidden). */
export async function listDeletedClients() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function restoreClient(id) {
  const { data, error } = await supabase
    .from('clients')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
