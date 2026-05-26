/* ════════════════════════════════════════════════════════════════
   USER QUESTIONS API — the user's daily questions, RLS-scoped.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listUserQuestions() {
  const { data, error } = await supabase
    .from('user_questions')
    .select('*')
    .is('deleted_at', null)
    .order('order', { ascending: true })
  if (error) throw error
  return data
}

export async function insertUserQuestion(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('user_questions').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateUserQuestion(id, patch) {
  const { data, error } = await supabase.from('user_questions').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeUserQuestion(id) {
  const { error } = await supabase.from('user_questions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
