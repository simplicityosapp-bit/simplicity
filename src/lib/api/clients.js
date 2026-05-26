/* ════════════════════════════════════════════════════════════════
   CLIENTS API — Supabase data access for the clients table.
   RLS scopes every row to the signed-in user (user_id = auth.uid()).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

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
    supabase.from('client_status_log').insert({
      user_id: session.user.id,
      client_id: data.id,
      old_status: null,
      new_status: data.status_meta,
      changed_at: new Date().toISOString(),
    }).then(() => {}, () => { /* non-fatal */ })
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
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      supabase.from('client_status_log').insert({
        user_id: session.user.id,
        client_id: id,
        old_status: oldMeta,
        new_status: cleanPatch.status_meta,
        changed_at: new Date().toISOString(),
      }).then(() => {}, () => { /* non-fatal */ })
    }
  }
  return data
}

/* Soft delete — sets deleted_at; row stays for the 30-day trash window. */
export async function removeClient(id) {
  const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
