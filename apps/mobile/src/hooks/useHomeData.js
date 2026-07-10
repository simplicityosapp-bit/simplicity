import { useState, useEffect, useCallback, useRef } from 'react'
import { isRecurring, nextScheduledAt } from '@simplicity/core'
import { supabase } from '../lib/supabase'
import { confirmScheduledMeeting } from '../lib/scheduledMeetings'
import { reconcileCompletion } from '../lib/tasks'
import { selectAll } from '../lib/paginate'

// Minimal data layer for the home screen. RLS scopes every row to the signed-in
// user, so a plain select is safe. We only read columns the home derivations
// need — none of them are encrypted-at-rest.
// Paginated (selectAll) so the net/goal-gap/pending figures never truncate past
// the 1000-row cap — matches web's selectAllRows.
// `scheduled_meetings` has no deleted_at column, so it's fetched unfiltered —
// core's todayItems still applies live()/inline deleted filtering client-side.
async function fetchTable(name, { filterDeleted = true } = {}) {
  const { data, error } = await selectAll(() => {
    let q = supabase.from(name).select('*')
    if (filterDeleted) q = q.is('deleted_at', null)
    return q
  })
  if (error) throw error
  return data ?? []
}

const EMPTY = {
  clients: [], transactions: [], meetings: [], calendarEvents: [], leads: [], groups: [],
  tasks: [], goals: [], categories: [], sessions: [], members: [], reminders: [],
  entries: [], answers: [], questions: [],
}

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']

export function useHomeData() {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  // Blank the screen with the full-screen loader ONLY on the first load; focus/
  // pull refetches keep the current content visible while they run.
  const loadedRef = useRef(false)
  // Freshest sessions for meeting-confirm numbering (avoids a stale-closure num
  // across rapid successive confirms). Tracks the latest committed state.
  const sessionsRef = useRef(data.sessions)
  sessionsRef.current = data.sessions

  const load = useCallback(async ({ mode } = {}) => {
    if (mode === 'refresh') setRefreshing(true)
    else if (!loadedRef.current) setLoading(true)
    setError(null)
    try {
      const [clients, transactions, meetings, calendarEvents, leads, groups, tasks, goals, categories, sessions, members, reminders, entries, answers, questions] = await Promise.all([
        fetchTable('clients'),
        fetchTable('transactions'),
        fetchTable('scheduled_meetings', { filterDeleted: false }),
        fetchTable('calendar_events'),
        fetchTable('leads'),
        fetchTable('groups'),
        fetchTable('tasks'),
        fetchTable('goals'),
        fetchTable('goal_categories'), // goal categories (moon/attention), NOT the finance `categories` table
        fetchTable('sessions'),
        fetchTable('group_members'),
        fetchTable('reminders'),
        fetchTable('goal_entries'),
        fetchTable('daily_answers'),
        fetchTable('user_questions'),
      ])
      setData({ clients, transactions, meetings, calendarEvents, leads, groups, tasks, goals, categories, sessions, members, reminders, entries, answers, questions })
      loadedRef.current = true
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Save a daily-question answer (mirrors web's insertDailyAnswer): insert, and
  // on the (question,date) partial-unique clash (23505 — re-answer today) update
  // the existing row instead. Updates local `answers` so the widget advances.
  const addAnswer = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = { ...payload }
    SERVER_OWNED.forEach((k) => delete row[k])
    row.user_id = session.user.id
    let saved
    const { data: ins, error } = await supabase.from('daily_answers').insert(row).select().single()
    if (error) {
      if (error.code === '23505' && row.user_question_id && row.date) {
        const { data: upd, error: updErr } = await supabase
          .from('daily_answers')
          .update({ value_num: row.value_num ?? null, value_text: row.value_text ?? null, note: row.note ?? null })
          .eq('user_question_id', row.user_question_id).eq('date', row.date).is('deleted_at', null)
          .select().single()
        if (updErr) throw updErr
        saved = upd
      } else {
        throw error
      }
    } else {
      saved = ins
    }
    setData((prev) => ({
      ...prev,
      answers: prev.answers.some((a) => a.id === saved.id)
        ? prev.answers.map((a) => (a.id === saved.id ? saved : a))
        : [saved, ...prev.answers],
    }))
    return saved
  }, [])

  // Generic "add a row" (mirrors the web api sanitize+insert pattern): strip
  // server-owned columns, stamp user_id, insert, and prepend to the matching
  // local array so derived widgets update without a refetch.
  const insertInto = useCallback(async (table, payload, key) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = { ...payload }
    SERVER_OWNED.forEach((k) => delete row[k])
    row.user_id = session.user.id
    const { data: saved, error: insErr } = await supabase.from(table).insert(row).select().single()
    if (insErr) throw insErr
    // prev[key] may be undefined for tables we insert into but don't fetch on
    // home (e.g. projects) — start a fresh array in that case.
    setData((prev) => ({ ...prev, [key]: [saved, ...(prev[key] || [])] }))
    return saved
  }, [])

  const addTask = useCallback((payload) => insertInto('tasks', reconcileCompletion({ status: 'todo', completed_at: null, ...payload }), 'tasks'), [insertInto])
  const addEntry = useCallback((payload) => insertInto('goal_entries', payload, 'entries'), [insertInto])
  const addTransaction = useCallback((payload) => insertInto('transactions', payload, 'transactions'), [insertInto])
  const addClient = useCallback((payload) => insertInto('clients', payload, 'clients'), [insertInto])
  const addLead = useCallback((payload) => insertInto('leads', payload, 'leads'), [insertInto])
  const addProject = useCallback((payload) => insertInto('projects', payload, 'projects'), [insertInto])
  const addReminder = useCallback((payload) => insertInto('reminders', payload, 'reminders'), [insertInto])
  const addMeeting = useCallback((payload) => insertInto('scheduled_meetings', payload, 'meetings'), [insertInto])
  const addSession = useCallback((payload) => insertInto('sessions', payload, 'sessions'), [insertInto])

  // Mark a scheduled meeting as happened / skipped (tile-drill "מה קרה" action).
  const setMeetingStatus = useCallback(async (id, status) => {
    if (!id) return
    setData((prev) => ({ ...prev, meetings: prev.meetings.map((m) => (m.id === id ? { ...m, status } : m)) }))
    const { error: e } = await supabase.from('scheduled_meetings').update({ status }).eq('id', id)
    if (e) load()
  }, [load])
  // Patch a scheduled_meeting (status + session_id link); optimistic.
  const updateMeetingRow = useCallback(async (id, patch) => {
    if (!id) return
    setData((prev) => ({ ...prev, meetings: prev.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
    const { error: e } = await supabase.from('scheduled_meetings').update(patch).eq('id', id)
    if (e) load()
  }, [load])
  // Confirm a meeting from home (tile-drill "מה קרה") — materialise a linked
  // session so it counts on the client card, matching web + the calendar flow.
  const confirmMeeting = useCallback(async (meeting) => {
    await confirmScheduledMeeting({ meeting, sessions: sessionsRef.current, addSession, updateMeeting: updateMeetingRow })
  }, [addSession, updateMeetingRow])

  // Inline complete-from-home (NextTasks ✓ / Reminders ✓), mirrors web.
  const toggleTask = useCallback(async (task) => {
    if (!task?.id) return
    const done = task.status !== 'done' // becoming done
    // Completing clears any custom status_id so a done task drops its
    // "in progress"-style chip (mirrors web useTasks.toggleTask).
    const patch = { status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null, ...(done ? { status_id: null } : {}) }
    setData((prev) => ({ ...prev, tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)) }))
    const { error: e } = await supabase.from('tasks').update(patch).eq('id', task.id)
    if (e) load()
  }, [load])
  // Complete a reminder from home (RemindersWidget ✓). A recurring reminder
  // advances to its next occurrence rather than being marked done (unless past
  // end_date) — mirrors web + useRemindersList. Looks up the full row by id so
  // recurrence fields are present regardless of the widget item shape.
  const completeReminder = useCallback(async (id) => {
    if (!id) return
    const reminder = data.reminders.find((r) => r.id === id)
    if (!reminder) return
    let patch
    if (isRecurring(reminder)) {
      const next = nextScheduledAt(reminder)
      patch = (reminder.end_date && next > new Date(reminder.end_date))
        ? { status: 'completed' }
        : { scheduled_at: next.toISOString() }
    } else {
      patch = { status: 'completed' }
    }
    setData((prev) => ({ ...prev, reminders: prev.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    const { error: e } = await supabase.from('reminders').update(patch).eq('id', id)
    if (e) load()
  }, [data.reminders, load])

  // Approve / skip a pending transaction from the home attention popup (mirrors
  // finance setStatus + web PendingSection). Optimistic; reload on failure.
  const setTransactionStatus = useCallback(async (id, status) => {
    if (!id) return
    setData((prev) => ({ ...prev, transactions: prev.transactions.map((t) => (t.id === id ? { ...t, status } : t)) }))
    const { error: e } = await supabase.from('transactions').update({ status }).eq('id', id)
    if (e) load()
  }, [load])
  // Soft-delete a transaction (deleted_at), matching useFinanceData.deleteTransaction.
  const deleteTransaction = useCallback(async (id) => {
    if (!id) return
    setData((prev) => ({ ...prev, transactions: prev.transactions.filter((t) => t.id !== id) }))
    const { error: e } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) load()
  }, [load])

  // refetch → pull-to-refresh (shows the RefreshControl spinner, keeps content);
  // reload → silent background refresh (screen focus), no spinner, no blank.
  const refetch = useCallback(() => load({ mode: 'refresh' }), [load])
  const reload = useCallback(() => load(), [load])

  return { ...data, loading, refreshing, error, refetch, reload, addAnswer, addTask, addEntry, addTransaction, addClient, addLead, addProject, addReminder, addMeeting, addSession, setMeetingStatus, confirmMeeting, toggleTask, completeReminder, setTransactionStatus, deleteTransaction }
}
