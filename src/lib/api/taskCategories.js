/* ════════════════════════════════════════════════════════════════
   TASK CATEGORIES API — per-user custom task categories (name + color).
   A second grouping axis for tasks alongside status (migration 0017).
   Mirrors the client_statuses / goal_categories CRUD shape.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listTaskCategories() {
  const { data, error } = await supabase
    .from('task_categories')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function insertTaskCategory(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('task_categories').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateTaskCategory(id, patch) {
  const { data, error } = await supabase.from('task_categories').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeTaskCategory(id) {
  const { error } = await supabase.from('task_categories').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function restoreTaskCategory(id) {
  const { data, error } = await supabase
    .from('task_categories')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/* Count live tasks currently in a given category. */
export async function countTasksByCategory(categoryId) {
  const { count, error } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .is('deleted_at', null)
  if (error) throw error
  return count || 0
}

/* Clear the category link on every task that used it (the task survives).
   null = uncategorize. */
export async function reassignTasksCategory(fromId, toId) {
  const { error } = await supabase
    .from('tasks')
    .update({ category_id: toId })
    .eq('category_id', fromId)
    .is('deleted_at', null)
  if (error) throw error
}
