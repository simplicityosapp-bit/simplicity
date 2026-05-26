/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS API — planned (future) meetings, RLS-scoped.
   ════════════════════════════════════════════════════════════════
   No soft-delete column on this table — delete is a hard delete.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listScheduledMeetings() {
  const { data, error } = await supabase
    .from('scheduled_meetings')
    .select('*')
    .order('scheduled_at', { ascending: true })
  if (error) throw error
  return data
}

export async function insertScheduledMeeting(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('scheduled_meetings').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateScheduledMeeting(id, patch) {
  const { data, error } = await supabase.from('scheduled_meetings').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeScheduledMeeting(id) {
  const { error } = await supabase.from('scheduled_meetings').delete().eq('id', id)
  if (error) throw error
}
