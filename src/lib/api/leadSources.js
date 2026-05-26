/* ════════════════════════════════════════════════════════════════
   LEAD SOURCES API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   Per-user list of inbound channels (e.g. Instagram, Referral). Used
   in the new-lead modal and on the lead card. */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listLeadSources() {
  const { data, error } = await supabase
    .from('lead_sources')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function insertLeadSource(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('lead_sources').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateLeadSource(id, patch) {
  const { data, error } = await supabase.from('lead_sources').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeLeadSource(id) {
  const { error } = await supabase.from('lead_sources').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
