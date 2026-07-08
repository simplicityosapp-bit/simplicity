import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useFormOptions } from '../lib/formOptions'

// Manage the shared task taxonomy (custom statuses + categories) used by tasks
// and reminders. Reads the lists from FormOptions and adds/soft-deletes rows,
// refreshing FormOptions after each change. RLS scopes rows to the user.
export function useTaskTaxonomy() {
  const { taskStatuses, taskCategories, refetch } = useFormOptions()

  const insertRow = useCallback(async (table, payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { error } = await supabase.from(table).insert({ ...payload, user_id: session.user.id })
    if (error) throw error
    await refetch()
  }, [refetch])

  // Clear the link on every task using this status/category BEFORE soft-deleting
  // the taxonomy row (the task survives, falling back to its meta / no category),
  // then refresh. Mirrors web reassignTasksStatus/Category → removeStatus/Category.
  const removeWithReassign = useCallback(async (table, field, id) => {
    try { await supabase.from('tasks').update({ [field]: null }).eq(field, id).is('deleted_at', null) } catch { /* non-fatal */ }
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await refetch()
  }, [refetch])

  // addStatus/addCategory take the full row (mirrors web onAddStatus/onAddCategory):
  // a status carries meta_category ('open'|'done' — the task_statuses CHECK; a
  // hardcoded 'todo' was rejected by the DB) + color; a category carries color.
  const addStatus = useCallback((payload) => insertRow('task_statuses', payload), [insertRow])
  const removeStatus = useCallback((id) => removeWithReassign('task_statuses', 'status_id', id), [removeWithReassign])
  const addCategory = useCallback((payload) => insertRow('task_categories', payload), [insertRow])
  const removeCategory = useCallback((id) => removeWithReassign('task_categories', 'category_id', id), [removeWithReassign])

  return { taskStatuses: taskStatuses || [], taskCategories: taskCategories || [], addStatus, removeStatus, addCategory, removeCategory }
}
