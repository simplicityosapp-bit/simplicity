import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { staleScheduledMeetingIds } from '../lib/scheduledMeetings'

// Clients + everything the drawer/sections need: the rows core clientBalance uses
// (transactions/sessions/members/groups) plus tasks + reminders for the client's
// activity panels. RLS scopes everything to the user.
async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').is('deleted_at', null).limit(2000)
  if (error) throw error
  return data ?? []
}

const EMPTY = { clients: [], transactions: [], sessions: [], members: [], groups: [], tasks: [], reminders: [] }

export function useClientsList() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [clients, transactions, sessions, members, groups, tasks, reminders] = await Promise.all([
        fetchTable('clients'),
        fetchTable('transactions'),
        fetchTable('sessions'),
        fetchTable('group_members'),
        fetchTable('groups'),
        fetchTable('tasks'),
        fetchTable('reminders'),
      ])
      setState({ clients, transactions, sessions, members, groups, tasks, reminders })
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const insertInto = useCallback(async (table, payload, key) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = { ...payload, user_id: session.user.id }
    const { data, error: e } = await supabase.from(table).insert(row).select().single()
    if (e) throw e
    setState((s) => ({ ...s, [key]: [data, ...s[key]] }))
    return data
  }, [])

  // Optimistic patch of one row in state[key]; refetch on error.
  const patchRow = useCallback(async (table, key, id, patch) => {
    setState((s) => ({ ...s, [key]: s[key].map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    const { data, error: e } = await supabase.from(table).update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setState((s) => ({ ...s, [key]: s[key].map((r) => (r.id === id ? data : r)) }))
    return data
  }, [load])

  // Soft-delete (deleted_at): drop the row optimistically; refetch on error.
  const softDelete = useCallback(async (table, key, id) => {
    setState((s) => ({ ...s, [key]: s[key].filter((r) => r.id !== id) }))
    const { error: e } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  // Add a client / payment / session (mirrors the launcher + drawer mutations).
  const addClient = useCallback((payload) => insertInto('clients', payload, 'clients'), [insertInto])
  const addTransaction = useCallback((payload) => insertInto('transactions', payload, 'transactions'), [insertInto])
  const addSession = useCallback((payload) => insertInto('sessions', payload, 'sessions'), [insertInto])
  // Schedule a meeting (scheduled_meetings isn't in this hook's state → insert only;
  // the calendar screen picks it up on its own load).
  const addMeeting = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('scheduled_meetings').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    return data
  }, [])

  // Patch a client, and when its recurring slot changes, hard-delete the FUTURE
  // PENDING meetings generated for the OLD slot so stale occurrences don't linger
  // on the calendar (mirrors web handleUpdateClient). Web-only generation won't
  // clean these up, so mobile must. scheduled_meetings is a hard delete (no
  // deleted_at column). Fetched on demand — the hook doesn't hold that state.
  const updateClient = useCallback(async (id, patch) => {
    const prev = state.clients.find((c) => c.id === id)
    const result = await patchRow('clients', 'clients', id, patch)
    if (prev && ('recurring_day' in patch || 'recurring_time' in patch)) {
      try {
        const { data: mtgs } = await supabase.from('scheduled_meetings').select('*')
          .eq('subject_type', 'client').eq('subject_id', id).eq('status', 'pending')
        const stale = staleScheduledMeetingIds(
          'client', id,
          { day: prev.recurring_day, time: prev.recurring_time },
          { day: patch.recurring_day, time: patch.recurring_time },
          mtgs || [],
        )
        for (const mid of stale) { await supabase.from('scheduled_meetings').delete().eq('id', mid) }
      } catch { /* non-fatal — the slot change itself already succeeded */ }
    }
    return result
  }, [patchRow, state.clients])
  const deleteClient = useCallback((id) => softDelete('clients', 'clients', id), [softDelete])
  const updateSession = useCallback((id, patch) => patchRow('sessions', 'sessions', id, patch), [patchRow])
  const updateTask = useCallback((id, patch) => patchRow('tasks', 'tasks', id, patch), [patchRow])
  const deleteTask = useCallback((id) => softDelete('tasks', 'tasks', id), [softDelete])
  const updateTransaction = useCallback((id, patch) => patchRow('transactions', 'transactions', id, patch), [patchRow])
  const deleteTransaction = useCallback((id) => softDelete('transactions', 'transactions', id), [softDelete])
  const updateReminder = useCallback((id, patch) => patchRow('reminders', 'reminders', id, patch), [patchRow])
  const deleteReminder = useCallback((id) => softDelete('reminders', 'reminders', id), [softDelete])
  // Per-group membership patch (group_members.total_override / has_custom_price) —
  // feeds clientBalance memberTotal; edited from EditClientModal's Groups section.
  const updateMember = useCallback((id, patch) => patchRow('group_members', 'members', id, patch), [patchRow])

  return {
    ...state, loading, error, refetch: load,
    addClient, addTransaction, addSession, addMeeting,
    updateClient, deleteClient,
    updateSession, updateTask, deleteTask, updateTransaction, deleteTransaction,
    updateReminder, deleteReminder, updateMember,
  }
}
