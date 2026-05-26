/* ════════════════════════════════════════════════════════════════
   SESSIONS API — logged (past) sessions, RLS-scoped to the user.
   ════════════════════════════════════════════════════════════════
   Client-only for now (groups aren't migrated). subject_type/subject_id
   mirror client_id, consistent with scheduled_meetings.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function insertSession(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('sessions').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateSession(id, patch) {
  const { data, error } = await supabase.from('sessions').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeSession(id) {
  const { error } = await supabase.from('sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
