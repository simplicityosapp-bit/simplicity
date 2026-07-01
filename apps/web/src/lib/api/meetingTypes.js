/* ════════════════════════════════════════════════════════════════
   MEETING TYPES API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   Per-user list of how a client is met (e.g. פיזית, אונליין). Each type
   can carry a default_price that auto-fills a client's price_per_session
   when the type is assigned. Used in the add/edit-client form and the
   meeting-types management modal. Mirrors the lead_sources stack. */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listMeetingTypes() {
  return selectAllRows(() => supabase
    .from('meeting_types')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true }))
}

export async function insertMeetingType(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('meeting_types').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateMeetingType(id, patch) {
  const { data, error } = await supabase.from('meeting_types').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeMeetingType(id) {
  const { error } = await supabase.from('meeting_types').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedMeetingTypes() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return selectAllRows(() => supabase
    .from('meeting_types')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false }))
}

export async function restoreMeetingType(id) {
  const { data, error } = await supabase
    .from('meeting_types')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/* Live price propagation: when a type's default_price changes, push it to
   every linked client that hasn't been manually overridden. Clients with
   price_overridden = true keep their hand-set price (the override wins).
   A null price is a "no preset" type — it never clobbers client prices. */
export async function applyMeetingTypePrice(typeId, price) {
  if (price == null || price === '') return
  const { error } = await supabase
    .from('clients')
    .update({ price_per_session: Number(price) })
    .eq('meeting_type_id', typeId)
    .eq('price_overridden', false)
    .is('deleted_at', null)
  if (error) throw error
}
