import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listReminders, insertReminder, updateReminder, removeReminder as apiRemove, restoreReminder } from '../lib/api/reminders'
import { isRecurring, nextScheduledAt } from '@simplicity/core'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: home mounts this in BOTH QuickRow and the tasks-and-reminders widget —
   one shared cache instead of a fetch per consumer. Public API unchanged. */
const KEY = ['reminders']
const bySchedule = (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)

export function useReminders() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listReminders })
  const reminders = data ?? []

  const addReminder = useCallback(async (payload) => {
    const row = await insertReminder(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row].sort(bySchedule))
    return row
  }, [qc])

  /* Accepts a reminder object (preferred) or an id. A recurring reminder
     ADVANCES to its next occurrence (so it actually recurs) instead of being
     marked done — unless it passed its end_date, then it stops. */
  const completeReminder = useCallback(async (arg) => {
    const r = (arg && typeof arg === 'object') ? arg : (qc.getQueryData(KEY) ?? []).find((x) => x.id === arg)
    if (!r) return
    let patch
    if (isRecurring(r)) {
      const next = nextScheduledAt(r)
      patch = (r.end_date && next > new Date(r.end_date))
        ? { status: 'completed' }
        : { scheduled_at: next.toISOString() }
    } else {
      patch = { status: 'completed' }
    }
    const advanced = !patch.status /* recurring → bumped to next slot, not done */
    const prev = { status: r.status, scheduled_at: r.scheduled_at }
    const apply = async (p) => {
      qc.setQueryData(KEY, (prevR) => (prevR ?? []).map((x) => (x.id === r.id ? { ...x, ...p } : x)).sort(bySchedule))
      try { await updateReminder(r.id, p) } catch { qc.invalidateQueries({ queryKey: KEY }) }
    }
    await apply(patch)
    /* Undo an accidental ✓ — restores the prior status/slot (a recurring
       reminder otherwise silently jumps to its next occurrence). */
    pushUndo({
      label: advanced ? 'התזכורת קודמה' : 'התזכורת הושלמה',
      undo: () => apply(prev),
      redo: () => apply(patch),
    })
  }, [qc])

  const editReminder = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)).sort(bySchedule))
    try {
      const row = await updateReminder(id, patch)
      qc.setQueryData(KEY, (prev) => (prev ?? []).map((r) => (r.id === id ? row : r)).sort(bySchedule))
      return row
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  const removeReminder = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((r) => r.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'התזכורת נמחקה',
        undo: async () => { try { await restoreReminder(id) } finally { qc.invalidateQueries({ queryKey: KEY }) } },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id))
          try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  /* Bulk-clear every completed reminder (soft-delete → Trash, restorable 30
     days — the safety net, like useTasks.clearCompleted). Recurring reminders
     never sit in 'completed' (they advance to the next slot), so this only
     sweeps real done rows. */
  const clearCompleted = useCallback(async () => {
    const done = (qc.getQueryData(KEY) ?? []).filter((r) => r.status === 'completed')
    if (!done.length) return 0
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.status !== 'completed'))
    try {
      await Promise.all(done.map((r) => apiRemove(r.id)))
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
    return done.length
  }, [qc])

  return { reminders, loading: isLoading, error: error?.message ?? null, addReminder, completeReminder, editReminder, removeReminder, clearCompleted, refetch }
}
