/* ════════════════════════════════════════════════════════════════
   DAILY ANSWERS API — answers to daily questions, RLS-scoped.
   ════════════════════════════════════════════════════════════════
   value_num XOR value_text (DB constraint): numeric scales use value_num,
   free-text uses value_text.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listDailyAnswers() {
  const { data, error } = await supabase
    .from('daily_answers')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function insertDailyAnswer(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('daily_answers').insert(row).select().single()
  if (error) throw error
  return data
}

export async function removeDailyAnswer(id) {
  const { error } = await supabase.from('daily_answers').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
