/* ════════════════════════════════════════════════════════════════
   RECURRING TEMPLATES API — Supabase data access (RLS-scoped).
   ════════════════════════════════════════════════════════════════
   A template describes a transaction that should be auto-generated
   on a schedule (monthly_date or weekly) until until_date (or
   forever, if null). The generation itself happens in
   src/lib/recurring.js; this file only owns row I/O.
   Note: `desc` is a reserved word in SQL — Supabase's PostgREST
   handles it but consumers should treat the column name normally.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listRecurring() {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertRecurring(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('recurring_templates').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateRecurring(id, patch) {
  const { data, error } = await supabase.from('recurring_templates').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeRecurring(id) {
  const { error } = await supabase.from('recurring_templates').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedRecurring() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function restoreRecurring(id) {
  const { data, error } = await supabase
    .from('recurring_templates')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
