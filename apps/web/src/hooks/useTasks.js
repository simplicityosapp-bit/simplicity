import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listTasks, insertTask, updateTask, removeTask as apiRemoveTask, restoreTask } from '../lib/api/tasks'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'
import { pushUndo } from '../lib/undo'

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
    /* Marking done clears any custom (open-meta) status_id — a finished
       task shouldn't keep an "in progress"-style status. Reopening leaves
       it cleared; the user can re-pick a status from the edit modal. */
    const patch = {
      status: done ? 'todo' : 'done',
      completed_at: done ? null : new Date().toISOString(),
      ...(done ? {} : { status_id: null }),
    }
    /* Snapshot the fields the toggle touches so the change is undoable
       (an accidental check on the ✓ is recoverable, like a lead move). */
    const prev = { status: task.status, completed_at: task.completed_at ?? null, status_id: task.status_id ?? null }
    const apply = (p) => {
      qc.setQueryData(KEY, (rows) => (rows ?? []).map((t) => (t.id === task.id ? { ...t, ...p } : t)))
      return updateTask(task.id, p).catch(() => qc.invalidateQueries({ queryKey: KEY }))
    }
    await apply(patch)
    pushUndo({
      label: done ? i18n.t('components:undo.taskReopened') : i18n.t('components:undo.taskCompleted'),
      undo: () => apply(prev),
      redo: () => apply(patch),
    })
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
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.task'), restoreFn: restoreTask, deleteFn: apiRemoveTask })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { tasks, loading: isLoading, error: error?.message ?? null, addTask, toggleTask, editTask, removeTask, clearCompleted, refetch }
}
