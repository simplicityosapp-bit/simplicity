import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listTasks, insertTask, updateTask, removeTask as apiRemoveTask } from '../lib/api/tasks'

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

  const removeTask = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.id !== id))
    try { await apiRemoveTask(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { tasks, loading: isLoading, error: error?.message ?? null, addTask, toggleTask, removeTask, refetch }
}
