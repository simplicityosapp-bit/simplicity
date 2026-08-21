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
  /* `ids` narrows the sweep to exactly the rows the caller counted. The
     tasks screen filters by category, so its "מחיקת שהושלמו" button and its
     confirm dialog both speak about a SLICE of the done rows — while this
     swept the whole table, binning forty tasks under a dialog that said
     three. Omitting it keeps the old whole-table behaviour for callers with
     no scope of their own. */
  const clearCompleted = useCallback(async (ids = null) => {
    const only = ids ? new Set(ids) : null
    const done = (qc.getQueryData(KEY) ?? []).filter((t) => t.status === 'done' && (!only || only.has(t.id)))
    if (!done.length) return 0
    /* Drop exactly what we are about to delete, not every done row — with a
       scope in hand the two are no longer the same set. */
    const going = new Set(done.map((t) => t.id))
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => !going.has(t.id)))
    /* allSettled, not all: Promise.all rejects on the FIRST failure and leaves
       the remaining deletes unawaited, so one bad row could abort the rest of
       a bulk clear the user had already seen disappear. Every delete is now
       attempted; reconcile only if something actually failed, and the failed
       rows come back on the refetch. */
    const results = await Promise.allSettled(done.map((t) => apiRemoveTask(t.id)))
    if (results.some((r) => r.status === 'rejected')) qc.invalidateQueries({ queryKey: KEY })
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
