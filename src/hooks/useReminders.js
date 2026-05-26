import { useCallback, useEffect, useState } from 'react'
import { listReminders, insertReminder, updateReminder, removeReminder as apiRemove } from '../lib/api/reminders'

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

  const completeReminder = useCallback(async (id) => {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'completed' } : r)))
    try {
      await updateReminder(id, { status: 'completed' })
    } catch (e) {
      setError(e.message)
      refetch()
    }
  }, [refetch])

  const removeReminder = useCallback(async (id) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { reminders, loading, error, addReminder, completeReminder, removeReminder, refetch }
}
