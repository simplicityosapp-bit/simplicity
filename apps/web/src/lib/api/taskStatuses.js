/* ════════════════════════════════════════════════════════════════
   TASK STATUSES API — per-user custom task statuses. Each rolls up to
   a fixed meta_category ('open' | 'done') so the binary open/done
   counters across the app keep working (migration 0017). Mirrors the
   client_statuses API.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listTaskStatuses() {
  return selectAllRows(() => supabase.from('task_statuses').select('*').is('deleted_at', null).order('sort_order', { ascending: true }).order('created_at', { ascending: true }))
}

export async function insertTaskStatus(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('task_statuses').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateTaskStatus(id, patch) {
  const { data, error } = await supabase.from('task_statuses').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeTaskStatus(id) {
  const { error } = await supabase.from('task_statuses').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function restoreTaskStatus(id) {
  const { data, error } = await supabase
    .from('task_statuses')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/* Count live tasks currently assigned to a given status. */
export async function countTasksByStatus(statusId) {
  const { count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('status_id', statusId)
    .is('deleted_at', null)
  if (error) throw error
  return count || 0
}

/* Clear the status link on every task that used it (the task survives,
   falling back to its todo/done meta). null = unassign. */
export async function reassignTasksStatus(fromId, toId) {
  const { error } = await supabase
    .from('tasks')
    .update({ status_id: toId })
    .eq('status_id', fromId)
    .is('deleted_at', null)
  if (error) throw error
}
