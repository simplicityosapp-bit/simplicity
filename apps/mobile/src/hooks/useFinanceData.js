import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Transactions for the finance screen. Core financeQuery/monthNet derive the
// month view; RLS scopes rows to the user.
export function useFinanceData() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.from('transactions').select('*').is('deleted_at', null).limit(2000)
      if (e) throw e
      setTransactions(data ?? [])
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { transactions, loading, error, refetch: load }
}
