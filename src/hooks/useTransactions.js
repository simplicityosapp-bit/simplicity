import { useCallback, useEffect, useState } from 'react'
import {
  listTransactions, insertTransaction, updateTransaction, removeTransaction as apiRemoveTx,
} from '../lib/api/transactions'

export function useTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTransactions(await listTransactions())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await listTransactions()
        if (active) { setTransactions(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addTransaction = useCallback(async (payload) => {
    const row = await insertTransaction(payload)
    setTransactions((prev) => [row, ...prev])
    return row
  }, [])

  const editTransaction = useCallback(async (id, patch) => {
    const row = await updateTransaction(id, patch)
    setTransactions((prev) => prev.map((t) => (t.id === id ? row : t)))
    return row
  }, [])

  const setStatus = useCallback(
    async (id, status) => {
      setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t))) // optimistic
      try {
        await updateTransaction(id, { status })
      } catch (e) {
        setError(e.message)
        refetch()
      }
    },
    [refetch],
  )

  const removeTransaction = useCallback(
    async (id) => {
      setTransactions((prev) => prev.filter((t) => t.id !== id))
      try { await apiRemoveTx(id) } catch (e) { setError(e.message); refetch() }
    },
    [refetch],
  )

  return { transactions, loading, error, addTransaction, editTransaction, setStatus, removeTransaction, refetch }
}
