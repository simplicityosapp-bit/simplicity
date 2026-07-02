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

  return { ...state, loading, error, refetch: load }
}
