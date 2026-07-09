import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectAll } from '../lib/paginate'

// Expense-category palette (mirrors the web CATEGORY_COLORS spirit).
export const CATEGORY_COLORS = ['#C97B5E', '#8BA888', '#D4A574', '#5a6a8c', '#b8845e', '#7a9b8e', '#b56e8a', '#6a8caf']

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
      const fetch = (t) => selectAll(() => supabase.from(t).select('*').is('deleted_at', null))
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

  // Set a transaction's status (pending → confirmed/skipped, or unskip → pending).
  const setStatus = useCallback((id, status) => updateTransaction(id, { status }), [updateTransaction])

  // Manage expense categories (add w/ a chosen or auto-assigned palette color / soft-delete).
  const addCategory = useCallback(async (name, chosenColor) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const color = chosenColor || CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]
    const { data, error: e } = await supabase.from('categories').insert({ name, color, user_id: session.user.id }).select().single()
    if (e) throw e
    setCategories((prev) => [...prev, data])
    return data
  }, [categories])
  const removeCategory = useCallback(async (id) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
    const { error: e } = await supabase.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { transactions, clients, categories, loading, error, refetch: load, addTransaction, updateTransaction, deleteTransaction, setStatus, addCategory, removeCategory }
}
