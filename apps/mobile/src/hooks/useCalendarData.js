import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Scheduled meetings + synced calendar events + the subjects (clients/groups)
// for meeting names. scheduled_meetings has no deleted_at column → unfiltered.
async function fetchTable(name, { filterDeleted = true } = {}) {
  let q = supabase.from(name).select('*').limit(2000)
  if (filterDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

const EMPTY = { meetings: [], calendarEvents: [], clients: [], groups: [], reminders: [], leads: [] }

export function useCalendarData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [meetings, calendarEvents, clients, groups, reminders, leads] = await Promise.all([
        fetchTable('scheduled_meetings', { filterDeleted: false }),
        fetchTable('calendar_events'),
        fetchTable('clients'),
        fetchTable('groups'),
        fetchTable('reminders'),
        fetchTable('leads'),
      ])
      setState({ meetings, calendarEvents, clients, groups, reminders, leads })
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Schedule a one-off meeting (mirrors the web ScheduleMeetingModal insert).
  const addMeeting = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('scheduled_meetings').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setState((s) => ({ ...s, meetings: [data, ...s.meetings] }))
    return data
  }, [])

  // Confirm / skip a pending meeting (status: pending → confirmed / skipped).
  const setMeetingStatus = useCallback(async (id, status) => {
    setState((s) => ({ ...s, meetings: s.meetings.map((m) => (m.id === id ? { ...m, status } : m)) }))
    const { error: e } = await supabase.from('scheduled_meetings').update({ status }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { ...state, loading, error, refetch: load, addMeeting, setMeetingStatus }
}
