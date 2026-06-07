import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listTasks, insertTask, updateTask, removeTask as apiRemoveTask, restoreTask } from '../lib/api/tasks'
import { registerDeleteUndo } from '../lib/undoActions'

/* React-Query-backed: home widgets (attention, chips, next-tasks) shared
   the same task fetch. Public API unchanged. */
const KEY = ['tasks']

export function useTasks() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listTasks })
  const tasks = data ?? []

  const addTask = useCallback(async (payload) => {
    const row = await insertTask(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const toggleTask = useCallback(async (task) => {
    const done = task.status === 'done'
    const patch = { status: done ? 'todo' : 'done', completed_at: done ? null : new Date().toISOString() }
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    try {
      await updateTask(task.id, patch)
    } catch {
      qc.invalidateQueries({ queryKey: KEY })
    }
  }, [qc])

  const editTask = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)))
    try {
      const row = await updateTask(id, patch)
      qc.setQueryData(KEY, (prev) => (prev ?? []).map((t) => (t.id === id ? row : t)))
      return row
    } catch {
      qc.invalidateQueries({ queryKey: KEY })
    }
  }, [qc])

  /* Bulk-clear every completed task in one go. Soft-delete (deleted_at), so
     the rows land in Trash and stay restorable for 30 days — that's the
     safety net here, rather than the single-level inline undo. */
  const clearCompleted = useCallback(async () => {
    const done = (qc.getQueryData(KEY) ?? []).filter((t) => t.status === 'done')
    if (!done.length) return 0
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.status !== 'done'))
    try {
      await Promise.all(done.map((t) => apiRemoveTask(t.id)))
    } catch {
      qc.invalidateQueries({ queryKey: KEY })
    }
    return done.length
  }, [qc])

  const removeTask = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((t) => t.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.id !== id))
    try {
      await apiRemoveTask(id)
      registerDeleteUndo({ qc, key: KEY, row, label: 'המשימה נמחקה', restoreFn: restoreTask, deleteFn: apiRemoveTask })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { tasks, loading: isLoading, error: error?.message ?? null, addTask, toggleTask, editTask, removeTask, clearCompleted, refetch }
}
