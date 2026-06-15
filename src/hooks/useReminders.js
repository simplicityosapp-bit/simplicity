import { useCallback, useEffect, useState } from 'react'
import { listReminders, insertReminder, updateReminder, removeReminder as apiRemove, restoreReminder } from '../lib/api/reminders'
import { isRecurring, nextScheduledAt } from '../lib/reminders'
import { pushUndo } from '../lib/undo'

const bySchedule = (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)

export function useReminders() {
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReminders(await listReminders())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await listReminders()
        if (active) { setReminders(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addReminder = useCallback(async (payload) => {
    const row = await insertReminder(payload)
    setReminders((prev) => [...prev, row].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))
    return row
  }, [])

  /* Accepts a reminder object (preferred) or an id. A recurring reminder
     ADVANCES to its next occurrence (so it actually recurs) instead of being
     marked done — unless it passed its end_date, then it stops. */
  const completeReminder = useCallback(async (arg) => {
    const r = (arg && typeof arg === 'object') ? arg : reminders.find((x) => x.id === arg)
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
      setReminders((prevR) => prevR.map((x) => (x.id === r.id ? { ...x, ...p } : x)).sort(bySchedule))
      try { await updateReminder(r.id, p) } catch (e) { setError(e.message); refetch() }
    }
    await apply(patch)
    /* Undo an accidental ✓ — restores the prior status/slot (a recurring
       reminder otherwise silently jumps to its next occurrence). */
    pushUndo({
      label: advanced ? 'התזכורת קודמה' : 'התזכורת הושלמה',
      undo: () => apply(prev),
      redo: () => apply(patch),
    })
  }, [reminders, refetch])

  const editReminder = useCallback(async (id, patch) => {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)).sort(bySchedule))
    try {
      const row = await updateReminder(id, patch)
      setReminders((prev) => prev.map((r) => (r.id === id ? row : r)).sort(bySchedule))
      return row
    } catch (e) {
      setError(e.message)
      refetch()
    }
  }, [refetch])

  const removeReminder = useCallback(async (id) => {
    const row = reminders.find((r) => r.id === id)
    setReminders((prev) => prev.filter((r) => r.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'התזכורת נמחקה',
        undo: async () => { try { await restoreReminder(id) } finally { refetch() } },
        redo: async () => {
          setReminders((prev) => prev.filter((r) => r.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [reminders, refetch])

  /* Bulk-clear every completed reminder (soft-delete → Trash, restorable 30
     days — the safety net, like useTasks.clearCompleted). Recurring reminders
     never sit in 'completed' (they advance to the next slot), so this only
     sweeps real done rows. */
  const clearCompleted = useCallback(async () => {
    const done = reminders.filter((r) => r.status === 'completed')
    if (!done.length) return 0
    setReminders((prev) => prev.filter((r) => r.status !== 'completed'))
    try {
      await Promise.all(done.map((r) => apiRemove(r.id)))
    } catch (e) { setError(e.message); refetch() }
    return done.length
  }, [reminders, refetch])

  return { reminders, loading, error, addReminder, completeReminder, editReminder, removeReminder, clearCompleted, refetch }
}
