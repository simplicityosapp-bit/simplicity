import { useCallback, useEffect, useState } from 'react'
import { listReminders, insertReminder, updateReminder, removeReminder as apiRemove } from '../lib/api/reminders'
import { isRecurring, nextScheduledAt } from '../lib/reminders'

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
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)).sort(bySchedule))
    try {
      await updateReminder(r.id, patch)
    } catch (e) {
      setError(e.message)
      refetch()
    }
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
    setReminders((prev) => prev.filter((r) => r.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { reminders, loading, error, addReminder, completeReminder, editReminder, removeReminder, refetch }
}
