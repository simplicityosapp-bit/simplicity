/* ════════════════════════════════════════════════════════════════
   TASKS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* Keep status and completed_at in sync defensively. If a caller marks
   a task done without setting completed_at, stamp it now; if they
   revert to todo, clear completed_at. Prevents the "marked done but
   never completed" rows that polluted historical "open tasks" counts. */
function reconcileCompletion(row) {
  if (row.status === 'done' && (row.completed_at === undefined || row.completed_at === null)) {
    return { ...row, completed_at: new Date().toISOString() }
  }
  if (row.status === 'todo') {
    return { ...row, completed_at: null }
  }
  return row
}

export async function listTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertTask(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = reconcileCompletion(sanitize(input))
  row.user_id = session.user.id
  const { data, error } = await supabase.from('tasks').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateTask(id, patch) {
  const row = reconcileCompletion(sanitize(patch))
  const { data, error } = await supabase.from('tasks').update(row).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeTask(id) {
  const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedTasks() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function restoreTask(id) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
