/* ════════════════════════════════════════════════════════════════
   TASKS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

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
  return selectAllRows(() => supabase
    .from('tasks')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
}

/* Reports only. Same rows as listTasks() PLUS the soft-deleted ones, because
   a task completed in June still counts for June after the user tidies it off
   the tasks screen (feedback acbbeaa5). Deliberately separate from listTasks:
   that one feeds the tasks screen and the home widgets, which must keep
   showing live rows only.

   No 30-day window, unlike listDeletedTasks() — the trash offers restore for
   30 days, but reports look back a year and nothing ever purges these rows. */
export async function listTasksForReports() {
  return selectAllRows(() => supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false }))
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
  return selectAllRows(() => supabase
    .from('tasks')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false }))
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
