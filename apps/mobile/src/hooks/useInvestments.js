import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { recordInvestmentPair, liveInvestments, INVESTMENT_CATEGORY_COLOR } from '../lib/investments'
import { pushUndo } from '../lib/undo'
import { showError } from '../lib/toast'
import i18n from '../lib/i18n'

/* The record behind the finance screen's investment row (web useInvestments).
   Takes the finance screen's own ledger writes, so an investment's expense
   lands in the list, the totals and the chart the moment it is recorded. */
export function useInvestments({ transactions, transactionsLoading, categories, addCategory, addTransaction, deleteTransaction, restoreTransaction }) {
  const [rows, setRows] = useState(null) // null = not loaded: "invested ₪0" would be a claim
  const [reminders, setReminders] = useState([])

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('investments').select('*').is('deleted_at', null).order('invested_on', { ascending: false })
      if (error) throw error
      setRows(data ?? [])
    } catch { setRows((prev) => prev ?? null) }
    try {
      /* Only the reminders this row reports on — an investment reminder still owed. */
      const { data } = await supabase.from('reminders').select('*').eq('linked_to_type', 'investment').is('deleted_at', null).order('scheduled_at', { ascending: true })
      setReminders((data ?? []).filter((r) => r.status !== 'completed'))
    } catch { /* the bell just stays unlit */ }
  }, [])
  useEffect(() => { load() }, [load])

  const investments = useMemo(
    () => (rows ? liveInvestments(rows, transactions, !transactionsLoading) : null),
    [rows, transactions, transactionsLoading],
  )

  const ensureCategory = useCallback(async () => {
    const name = i18n.t('finance:investment.categoryName')
    const existing = (categories || []).find((c) => c.name === name)
    if (existing) return existing.id
    const created = await addCategory(name, INVESTMENT_CATEGORY_COLOR)
    return created?.id ?? null
  }, [categories, addCategory])

  const insertInvestment = useCallback(async (row) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error } = await supabase.from('investments').insert({ ...row, user_id: session.user.id }).select().single()
    if (error) throw error
    return data
  }, [])

  const recordInvestment = useCallback(async (input) => {
    try {
      const row = await recordInvestmentPair(input, {
        ensureCategory, addTransaction, insertInvestment, rollbackTransaction: deleteTransaction, txDesc: i18n.t('finance:investment.txDesc'),
      })
      if (row) setRows((prev) => [row, ...(prev ?? [])])
      return row
    } catch (e) {
      showError(i18n.t('finance:investment.recordFailed'))
      throw e
    }
  }, [ensureCategory, addTransaction, insertInvestment, deleteTransaction])

  const setDeleted = (id, deleted) => supabase.from('investments').update({ deleted_at: deleted ? new Date().toISOString() : null }).eq('id', id)

  /* The pair goes together, both ways — "השקעתי" was one action. */
  const undoInvestment = useCallback(async (id) => {
    const row = (rows || []).find((r) => r.id === id)
    if (!row) return
    const txId = row.transaction_id || null
    const drop = () => setRows((prev) => (prev ?? []).filter((r) => r.id !== id))
    drop()
    try {
      const { error } = await setDeleted(id, true)
      if (error) throw error
      if (txId) await Promise.resolve(deleteTransaction(txId)).catch(() => {})
      pushUndo({
        label: i18n.t('finance:investment.undoLabel'),
        undo: async () => {
          try {
            await setDeleted(id, false)
            if (txId) await Promise.resolve(restoreTransaction(txId)).catch(() => {})
          } finally { load() }
        },
        redo: async () => {
          drop()
          try {
            await setDeleted(id, true)
            if (txId) await Promise.resolve(deleteTransaction(txId)).catch(() => {})
          } catch { load() }
        },
      })
    } catch {
      load()
      showError(i18n.t('components:errors.actionFailed'))
    }
  }, [rows, deleteTransaction, restoreTransaction, load])

  const addReminder = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error } = await supabase.from('reminders').insert({ ...payload, user_id: session.user.id }).select().single()
    if (error) throw error
    setReminders((prev) => [...prev, data].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))
    return data
  }, [])

  return { investments, reminders, refetch: load, recordInvestment, undoInvestment, addReminder }
}
