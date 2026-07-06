import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Clients + the rows core clientBalance needs (transactions/sessions/members/
// groups). RLS scopes everything to the user.
async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').is('deleted_at', null).limit(2000)
  if (error) throw error
  return data ?? []
}

const EMPTY = { clients: [], transactions: [], sessions: [], members: [], groups: [] }

export function useClientsList() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [clients, transactions, sessions, members, groups] = await Promise.all([
        fetchTable('clients'),
        fetchTable('transactions'),
        fetchTable('sessions'),
        fetchTable('group_members'),
        fetchTable('groups'),
      ])
      setState({ clients, transactions, sessions, members, groups })
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
  // Add a client / a payment (mirrors the launcher mutations).
  const addClient = useCallback((payload) => insertInto('clients', payload, 'clients'), [insertInto])
  const addTransaction = useCallback((payload) => insertInto('transactions', payload, 'transactions'), [insertInto])

  // Edit a client (name/phone/…): optimistic patch, refetch on error.
  const updateClient = useCallback(async (id, patch) => {
    setState((s) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    const { data, error: e } = await supabase.from('clients').update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setState((s) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? data : c)) }))
    return data
  }, [load])

  // Soft-delete (deleted_at): drop the row optimistically; refetch on error.
  const deleteClient = useCallback(async (id) => {
    setState((s) => ({ ...s, clients: s.clients.filter((c) => c.id !== id) }))
    const { error: e } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { ...state, loading, error, refetch: load, addClient, addTransaction, updateClient, deleteClient }
}
