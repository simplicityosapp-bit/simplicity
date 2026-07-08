import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { confirmScheduledMeeting, skipScheduledMeeting } from '../lib/scheduledMeetings'

// Scheduled meetings + synced calendar events + the subjects (clients/groups)
// for meeting names. scheduled_meetings has no deleted_at column → unfiltered.
async function fetchTable(name, { filterDeleted = true } = {}) {
  let q = supabase.from(name).select('*').limit(2000)
  if (filterDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

const EMPTY = { meetings: [], calendarEvents: [], clients: [], groups: [], reminders: [], leads: [], sessions: [] }

export function useCalendarData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Freshest sessions for meeting-confirm numbering — reading state.sessions
  // from a callback closure can be stale across rapid successive confirms
  // (two would compute the same session num). The ref tracks the latest commit.
  const sessionsRef = useRef(state.sessions)
  sessionsRef.current = state.sessions

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [meetings, calendarEvents, clients, groups, reminders, leads, sessions] = await Promise.all([
        fetchTable('scheduled_meetings', { filterDeleted: false }),
        fetchTable('calendar_events'),
        fetchTable('clients'),
        fetchTable('groups'),
        fetchTable('reminders'),
        fetchTable('leads'),
        fetchTable('sessions'),
      ])
      setState({ meetings, calendarEvents, clients, groups, reminders, leads, sessions })
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

  // Insert a session (materialised on meeting-confirm); prepend to local state.
  const addSession = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('sessions').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setState((s) => ({ ...s, sessions: [data, ...s.sessions] }))
    return data
  }, [])

  // Soft-delete a materialised session (meeting un-confirmed / skipped).
  const removeSession = useCallback(async (id) => {
    if (!id) return
    setState((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }))
    const { error: e } = await supabase.from('sessions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) load()
  }, [load])

  // Patch a scheduled_meeting (status + session_id link); optimistic.
  const updateMeeting = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, meetings: s.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
    const { error: e } = await supabase.from('scheduled_meetings').update(patch).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  // Confirm "it happened" — materialises a linked session (mirrors web). Uses
  // sessionsRef for freshest numbering, and swallows a failed write: updateMeeting
  // already reloads on error, so the try/catch just prevents an unhandled
  // rejection reaching the un-awaited onPress in CalendarScreen.
  const confirmMeeting = useCallback(async (meeting) => {
    try { await confirmScheduledMeeting({ meeting, sessions: sessionsRef.current, addSession, updateMeeting }) } catch { /* updateMeeting already reloaded */ }
  }, [addSession, updateMeeting])
  const skipMeeting = useCallback(async (meeting) => {
    try { await skipScheduledMeeting({ meeting, updateMeeting, removeSession }) } catch { /* updateMeeting already reloaded */ }
  }, [updateMeeting, removeSession])

  return { ...state, loading, error, refetch: load, addMeeting, setMeetingStatus, addSession, removeSession, updateMeeting, confirmMeeting, skipMeeting }
}
