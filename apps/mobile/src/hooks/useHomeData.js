import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Minimal data layer for the home screen. RLS scopes every row to the signed-in
// user, so a plain select is safe. We only read columns the home derivations
// need (status/amount/date/…) — none of them are encrypted-at-rest.
// NOTE: single select (Supabase's 1000-row default). Fine for typical coach
// volumes; a proper paginated fetch (like web's selectAllRows) is a follow-up.
async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').is('deleted_at', null).limit(2000)
  if (error) throw error
  return data ?? []
}

export function useHomeData() {
  const [clients, setClients] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, t] = await Promise.all([fetchTable('clients'), fetchTable('transactions')])
      setClients(c)
      setTransactions(t)
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { clients, transactions, loading, error, refetch: load }
}
