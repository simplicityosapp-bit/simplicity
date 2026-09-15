import { useState, useEffect, useCallback, useRef } from 'react'
import { isRecurring, nextScheduledAt } from '@simplicity/core'
import { supabase } from '../lib/supabase'
import { confirmScheduledMeeting, skipScheduledMeeting, rescheduleScheduledMeeting } from '../lib/scheduledMeetings'
import { reconcileCompletion } from '../lib/tasks'
import { callGoogleCalendar } from '../lib/googleCalendar'
import { pushUndo } from '../lib/undo'
import { showError } from '../lib/toast'
import i18n from '../lib/i18n'

// Scheduled meetings + synced calendar events + the subjects (clients/groups)
// for meeting names. scheduled_meetings has no deleted_at column → unfiltered.
async function fetchTable(name, { filterDeleted = true, columns = '*' } = {}) {
  let q = supabase.from(name).select(columns).limit(2000)
  if (filterDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}
/* The booking context is extra — a calendar that cannot read it still has to
   open. Failing soft keeps a missing permission or table from blanking the
   whole feed. */
const optional = (p) => p.catch(() => [])

const EMPTY = { meetings: [], calendarEvents: [], clients: [], groups: [], reminders: [], leads: [], sessions: [], bookings: [], bookingPages: [], meetingTypes: [], projects: [] }

export function useCalendarData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Freshest sessions for meeting-confirm numbering — reading state.sessions
  // from a callback closure can be stale across rapid successive confirms
  // (two would compute the same session num). The ref tracks the latest commit.
  const sessionsRef = useRef(state.sessions)
  sessionsRef.current = state.sessions

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const [meetings, calendarEvents, clients, groups, reminders, leads, sessions, bookings, bookingPages, meetingTypes, projects] = await Promise.all([
        fetchTable('scheduled_meetings', { filterDeleted: false }),
        fetchTable('calendar_events'),
        fetchTable('clients'),
        fetchTable('groups'),
        fetchTable('reminders'),
        fetchTable('leads'),
        fetchTable('sessions'),
        optional(fetchTable('bookings', { filterDeleted: false })),
        optional(fetchTable('booking_pages', { columns: 'id,title' })),
        optional(fetchTable('meeting_types', { filterDeleted: false, columns: 'id,name' })),
        optional(fetchTable('projects', { columns: 'id,name' })),
      ])
      setState({ meetings, calendarEvents, clients, groups, reminders, leads, sessions, bookings, bookingPages, meetingTypes, projects })
    } catch (e) {
      if (!silent) setError(e?.message || 'load failed')
    } finally {
      if (!silent) setLoading(false)
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

  // Hard delete — only the undo of a reschedule uses it (web removeScheduledMeeting).
  const removeMeeting = useCallback(async (id) => {
    setState((s) => ({ ...s, meetings: s.meetings.filter((m) => m.id !== id) }))
    const { error: e } = await supabase.from('scheduled_meetings').delete().eq('id', id)
    if (e) { load(true); throw e }
  }, [load])

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
  // The undo of that: bring the session back (web putBackSession).
  const putBackSession = useCallback(async (id) => {
    if (!id) return
    try {
      await supabase.from('sessions').update({ deleted_at: null }).eq('id', id)
    } finally { load(true) }
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
  /* Skip ("didn't happen"), cancel (an upcoming one) and delete (a confirmed
     one) are one unwinding with three names — each with its own undo label,
     as on web. */
  const skipMeeting = useCallback(async (meeting, label = i18n.t('calendar:toast.meetingSkipped')) => {
    try {
      await skipScheduledMeeting({ meeting, updateMeeting, removeSession, putBackSession, pushUndo, label })
    } catch {
      showError(i18n.t('calendar:toast.actionFailed'))
    }
  }, [updateMeeting, removeSession, putBackSession])
  // Throws: the details sheet keeps its form open on a rejected move.
  const rescheduleMeeting = useCallback(
    (meeting, at) => rescheduleScheduledMeeting({ meeting, at, updateMeeting, addMeeting, removeMeeting, pushUndo, label: i18n.t('calendar:toast.meetingRescheduled') }),
    [updateMeeting, addMeeting, removeMeeting],
  )

  // Own + edit a synced calendar_event. Setting owned=true detaches it from the
  // one-way Google sync (the Edge Function skips owned rows — migration 0023) so
  // the new title/time survive the next sync. Mirrors web useCalendarEvents.
  const updateEvent = useCallback(async (ev, patch) => {
    const next = { ...patch, owned: true }
    setState((s) => ({ ...s, calendarEvents: s.calendarEvents.map((r) => (r.id === ev.id ? { ...r, ...next } : r)) }))
    const { error: e } = await supabase.from('calendar_events').update(next).eq('id', ev.id)
    if (e) { load(); throw e }
  }, [load])
  // Own + delete a synced calendar_event for good (owned=true so the soft-delete
  // survives future syncs — without it the sync resets deleted_at). Mirrors web.
  // Also what hides the Google side of a duplicate (web dismissEvent).
  const deleteEvent = useCallback(async (ev) => {
    setState((s) => ({ ...s, calendarEvents: s.calendarEvents.filter((r) => r.id !== ev.id) }))
    const { error: e } = await supabase.from('calendar_events').update({ owned: true, deleted_at: new Date().toISOString() }).eq('id', ev.id)
    if (e) { load(); throw e }
  }, [load])
  // Un-hide (undo of an auto-hidden duplicate). Stays owned, so it is never
  // re-clobbered by the sync nor re-auto-hidden.
  const restoreEvent = useCallback(async (ev) => {
    setState((s) => ({ ...s, calendarEvents: [{ ...ev, owned: true, deleted_at: null }, ...s.calendarEvents.filter((r) => r.id !== ev.id)] }))
    const { error: e } = await supabase.from('calendar_events').update({ owned: true, deleted_at: null }).eq('id', ev.id)
    if (e) { load(); throw e }
  }, [load])

  /* Cancel a booking from its calendar event (web cancelBooking + deleteEvent):
     take it off Google (best-effort — a coach without the connection still
     cancels), free the slot, and remove the owned event. The lead stays. */
  const cancelBooking = useCallback(async (booking, ev) => {
    try { await callGoogleCalendar('unpush-booking', { bookingId: booking.id }) } catch { /* not connected / already gone */ }
    const { error: e } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
    if (e) throw e
    setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === booking.id ? { ...b, status: 'cancelled' } : b)) }))
    if (ev) await deleteEvent(ev)
  }, [deleteEvent])

  /* Reminders from the calendar (web useReminders): a recurring one advances to
     its next occurrence unless past its end date; a one-off completes. Both
     undoable. */
  const completeReminder = useCallback(async (reminder) => {
    let patch
    if (isRecurring(reminder)) {
      const next = nextScheduledAt(reminder)
      patch = (reminder.end_date && next > new Date(reminder.end_date)) ? { status: 'completed' } : { scheduled_at: next.toISOString() }
    } else {
      patch = { status: 'completed' }
    }
    const prev = { status: reminder.status, scheduled_at: reminder.scheduled_at }
    const apply = async (values) => {
      setState((s) => ({ ...s, reminders: s.reminders.map((r) => (r.id === reminder.id ? { ...r, ...values } : r)) }))
      const { error: e } = await supabase.from('reminders').update(values).eq('id', reminder.id)
      if (e) { load(true); throw e }
    }
    try {
      await apply(patch)
      pushUndo({ label: i18n.t('tasks:item.reminderDone'), undo: () => apply(prev), redo: () => apply(patch) })
    } catch {
      showError(i18n.t('calendar:toast.actionFailed'))
    }
  }, [load])
  const removeReminder = useCallback(async (reminder) => {
    const stamp = async (deleted_at) => {
      setState((s) => ({
        ...s,
        reminders: deleted_at ? s.reminders.filter((r) => r.id !== reminder.id) : [reminder, ...s.reminders.filter((r) => r.id !== reminder.id)],
      }))
      const { error: e } = await supabase.from('reminders').update({ deleted_at }).eq('id', reminder.id)
      if (e) { load(true); throw e }
    }
    try {
      await stamp(new Date().toISOString())
      pushUndo({ label: i18n.t('components:undo.deleted.reminder'), undo: () => stamp(null), redo: () => stamp(new Date().toISOString()) })
    } catch {
      showError(i18n.t('calendar:toast.actionFailed'))
    }
  }, [load])
  // A lead's follow-up done from the calendar: clears the date (the lead stays).
  const clearFollowup = useCallback(async (lead) => {
    const prev = lead.follow_up_date ?? null
    const apply = async (follow_up_date) => {
      setState((s) => ({ ...s, leads: s.leads.map((l) => (l.id === lead.id ? { ...l, follow_up_date } : l)) }))
      const { error: e } = await supabase.from('leads').update({ follow_up_date }).eq('id', lead.id)
      if (e) { load(true); throw e }
    }
    try {
      await apply(null)
      pushUndo({ label: i18n.t('calendar:toast.followupDone'), undo: () => apply(prev), redo: () => apply(null) })
    } catch {
      showError(i18n.t('calendar:toast.actionFailed'))
    }
  }, [load])

  // The add chooser's other three kinds (web CalendarAddGate).
  const insertRow = useCallback(async (table, payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from(table).insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    return data
  }, [])
  const addReminder = useCallback(async (payload) => {
    const data = await insertRow('reminders', payload)
    setState((s) => ({ ...s, reminders: [data, ...s.reminders] }))
    return data
  }, [insertRow])
  const addTask = useCallback((payload) => insertRow('tasks', reconcileCompletion(payload)), [insertRow])
  const addTransaction = useCallback((payload) => insertRow('transactions', payload), [insertRow])

  return {
    ...state, loading, error, refetch: load,
    addMeeting, removeMeeting, setMeetingStatus, addSession, removeSession, putBackSession, updateMeeting,
    confirmMeeting, skipMeeting, rescheduleMeeting,
    updateEvent, deleteEvent, restoreEvent, cancelBooking,
    completeReminder, removeReminder, clearFollowup,
    addReminder, addTask, addTransaction,
  }
}
