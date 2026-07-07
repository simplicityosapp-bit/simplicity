import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

  const updateClient = useCallback((id, patch) => patchRow('clients', 'clients', id, patch), [patchRow])
  const deleteClient = useCallback((id) => softDelete('clients', 'clients', id), [softDelete])
  const updateSession = useCallback((id, patch) => patchRow('sessions', 'sessions', id, patch), [patchRow])
  const updateTask = useCallback((id, patch) => patchRow('tasks', 'tasks', id, patch), [patchRow])
  const deleteTask = useCallback((id) => softDelete('tasks', 'tasks', id), [softDelete])
  const updateTransaction = useCallback((id, patch) => patchRow('transactions', 'transactions', id, patch), [patchRow])
  const deleteTransaction = useCallback((id) => softDelete('transactions', 'transactions', id), [softDelete])
  const updateReminder = useCallback((id, patch) => patchRow('reminders', 'reminders', id, patch), [patchRow])
  const deleteReminder = useCallback((id) => softDelete('reminders', 'reminders', id), [softDelete])

  return {
    ...state, loading, error, refetch: load,
    addClient, addTransaction, addSession, addMeeting,
    updateClient, deleteClient,
    updateSession, updateTask, deleteTask, updateTransaction, deleteTransaction,
    updateReminder, deleteReminder,
  }
}
