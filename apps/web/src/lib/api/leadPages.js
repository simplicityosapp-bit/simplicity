/* ════════════════════════════════════════════════════════════════
   LEAD PAGES API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   The builder config for public lead-capture pages (/lead/<id>). The
   public page itself never reads this table — a service-role edge
   function (`lead-intake`) serves the published config and writes the
   resulting lead. Here we only manage the owner's own pages. */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listLeadPages() {
  return selectAllRows(() => supabase
    .from('lead_pages')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
}

export async function insertLeadPage(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('lead_pages').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateLeadPage(id, patch) {
  const { data, error } = await supabase
    .from('lead_pages')
    .update(sanitize(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeLeadPage(id) {
  const { error } = await supabase
    .from('lead_pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreLeadPage(id) {
  const { data, error } = await supabase
    .from('lead_pages')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
