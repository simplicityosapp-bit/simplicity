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

  const softDelete = useCallback(async (table, id) => {
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
    await refetch()
  }, [refetch])

  const addStatus = useCallback((display_name) => insertRow('task_statuses', { display_name, meta_category: 'todo' }), [insertRow])
  const removeStatus = useCallback((id) => softDelete('task_statuses', id), [softDelete])
  const addCategory = useCallback((name) => insertRow('task_categories', { name }), [insertRow])
  const removeCategory = useCallback((id) => softDelete('task_categories', id), [softDelete])

  return { taskStatuses: taskStatuses || [], taskCategories: taskCategories || [], addStatus, removeStatus, addCategory, removeCategory }
}
