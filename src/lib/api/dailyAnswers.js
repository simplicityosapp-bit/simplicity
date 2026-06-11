/* ════════════════════════════════════════════════════════════════
   DAILY ANSWERS API — answers to daily questions, RLS-scoped.
   ════════════════════════════════════════════════════════════════
   value_num XOR value_text (DB constraint): numeric scales use value_num,
   free-text uses value_text.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listDailyAnswers() {
  return selectAllRows(() => supabase
    .from('daily_answers')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false }))
}

export async function insertDailyAnswer(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('daily_answers').insert(row).select().single()
  if (!error) return data
  /* One non-deleted answer per (question, date) — a partial-unique index. A
     double-submit / two tabs / StrictMode hits 23505; treat it as "edit today's
     answer" and update the existing row instead of surfacing a raw DB error. */
  if (error.code === '23505' && row.user_question_id && row.date) {
    const { data: upd, error: updErr } = await supabase
      .from('daily_answers')
      .update({ value_num: row.value_num ?? null, value_text: row.value_text ?? null, note: row.note ?? null })
      .eq('user_question_id', row.user_question_id).eq('date', row.date).is('deleted_at', null)
      .select().single()
    if (updErr) throw updErr
    return upd
  }
  throw error
}

export async function removeDailyAnswer(id) {
  const { error } = await supabase.from('daily_answers').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedDailyAnswers() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return selectAllRows(() => supabase
    .from('daily_answers')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false }))
}

export async function restoreDailyAnswer(id) {
  const { data, error } = await supabase
    .from('daily_answers')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
