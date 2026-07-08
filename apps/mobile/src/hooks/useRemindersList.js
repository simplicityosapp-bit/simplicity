import { useState, useEffect, useCallback } from 'react'
import { isRecurring, nextScheduledAt } from '@simplicity/core'
import { supabase } from '../lib/supabase'

// Reminders list + mutations for the Tasks screen's reminders view (mirrors the
// web useReminders core: add / complete / edit / soft-delete / clear-completed).
// RLS scopes rows to the user.
export function useRemindersList() {
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.from('reminders').select('*').is('deleted_at', null).limit(2000)
      if (e) throw e
      setReminders(data ?? [])
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const addReminder = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('reminders').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setReminders((prev) => [data, ...prev])
    return data
  }, [])

  const editReminder = useCallback(async (id, patch) => {
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    const { data, error: e } = await supabase.from('reminders').update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setReminders((prev) => prev.map((r) => (r.id === id ? data : r)))
    return data
  }, [load])

  // Complete a reminder. A RECURRING reminder ADVANCES to its next occurrence
  // (so it actually recurs) instead of being marked done — unless it passed its
  // end_date, then it stops. One-shot → completed. Mirrors web useReminders.
  const completeReminder = useCallback(async (reminder) => {
    let patch
    if (isRecurring(reminder)) {
      const next = nextScheduledAt(reminder)
      patch = (reminder.end_date && next > new Date(reminder.end_date))
        ? { status: 'completed' }
        : { scheduled_at: next.toISOString() }
    } else {
      patch = { status: 'completed' }
    }
    const prev = { status: reminder.status, scheduled_at: reminder.scheduled_at }
    setReminders((rs) => rs.map((r) => (r.id === reminder.id ? { ...r, ...patch } : r)))
    const { error: e } = await supabase.from('reminders').update(patch).eq('id', reminder.id)
    if (e) setReminders((rs) => rs.map((r) => (r.id === reminder.id ? { ...r, ...prev } : r)))
  }, [])

  const deleteReminder = useCallback(async (id) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    const { error: e } = await supabase.from('reminders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  // Clear all completed reminders (soft-delete every completed row at once).
  const clearCompleted = useCallback(async () => {
    const ids = reminders.filter((r) => r.status === 'completed').map((r) => r.id)
    if (!ids.length) return
    setReminders((prev) => prev.filter((r) => r.status !== 'completed'))
    const { error: e } = await supabase.from('reminders').update({ deleted_at: new Date().toISOString() }).in('id', ids)
    if (e) { load(); throw e }
  }, [reminders, load])

  return { reminders, loading, error, refetch: load, addReminder, editReminder, completeReminder, deleteReminder, clearCompleted }
}
