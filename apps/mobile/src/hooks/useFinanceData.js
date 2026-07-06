import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Transactions for the finance screen. Core financeQuery/monthNet derive the
// month view; RLS scopes rows to the user.
export function useFinanceData() {
  const [transactions, setTransactions] = useState([])
  const [clients, setClients] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fetch = (t) => supabase.from(t).select('*').is('deleted_at', null).limit(2000)
      const [tx, cl, cat] = await Promise.all([fetch('transactions'), fetch('clients'), fetch('categories')])
      if (tx.error) throw tx.error
      setTransactions(tx.data ?? [])
      setClients(cl.data ?? [])
      setCategories(cat.data ?? [])
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addTransaction = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('transactions').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    setTransactions((prev) => [data, ...prev])
    return data
  }, [])

  const updateTransaction = useCallback(async (id, patch) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))) // optimistic
    const { data, error: e } = await supabase.from('transactions').update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setTransactions((prev) => prev.map((t) => (t.id === id ? data : t)))
    return data
  }, [load])

  const deleteTransaction = useCallback(async (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id)) // optimistic remove
    const { error: e } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { transactions, clients, categories, loading, error, refetch: load, addTransaction, updateTransaction, deleteTransaction }
}
