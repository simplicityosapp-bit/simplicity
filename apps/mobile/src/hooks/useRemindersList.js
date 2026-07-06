import { useState, useEffect, useCallback } from 'react'
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

  // Mark a reminder done (one-shot). Optimistic; rolls back on error.
  const completeReminder = useCallback(async (reminder) => {
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, status: 'completed' } : r)))
    const { error: e } = await supabase.from('reminders').update({ status: 'completed' }).eq('id', reminder.id)
    if (e) setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, status: reminder.status } : r)))
  }, [])

  const deleteReminder = useCallback(async (id) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
    const { error: e } = await supabase.from('reminders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { reminders, loading, error, refetch: load, addReminder, editReminder, completeReminder, deleteReminder }
}
