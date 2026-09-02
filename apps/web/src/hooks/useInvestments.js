import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from '@simplicity/core/i18n'
import {
  listInvestments, insertInvestment, localDateString,
  removeInvestment as apiRemoveInvestment, restoreInvestment,
} from '../lib/api/investments'
import { useTransactions } from './useTransactions'
import { restoreTransaction } from '../lib/api/transactions'
import { useCategories } from './useCategories'
import { pushUndo } from '../lib/undo'
import { showError } from '../lib/toast'
import { revertWrite } from '../lib/revertWrite'

/* ════════════════════════════════════════════════════════════════
   useInvestments — the record behind the finance investment widget.
   ════════════════════════════════════════════════════════════════
   Recording an investment writes TWO rows, on purpose:
     1. an expense transaction, so the money leaves the ledger and shows
        up in נטו like any other outgoing;
     2. an `investments` row linked to it, which is the feature's own
        memory and survives anything that happens to the transaction.

   The widget's base then excludes exactly those linked transaction ids
   (see computeInvestment) — by id, never by category name, so renaming
   the category can't rewrite history or move the target.
   ════════════════════════════════════════════════════════════════ */

const KEY = ['investments']

export function useInvestments() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listInvestments })
  const investments = data ?? []
  const { addTransaction, removeTransaction } = useTransactions()
  const { categories, addCategory, loading: categoriesLoading, refetch: refetchCategories } = useCategories()

  /* The expense needs a category so it reads as an investment in the finance
     list. Find-or-create by name: `categories` has no stable key, only a
     user-editable name. That's fine here — the category is for the user's own
     reading, and nothing about the maths depends on it. If they rename it, the
     next investment simply opens a fresh one; no figure changes either way. */
  const ensureCategory = useCallback(async () => {
    const name = i18n.t('finance:investment.categoryName')
    /* Settle the list before deciding it's missing. While the query is still in
       flight `categories` is [], so a user who opens the row and presses
       "השקעתי" straight away would look at an empty list, conclude no category
       exists, and create a second "השקעות" alongside the real one. */
    let list = categories
    if (categoriesLoading || !list.length) {
      const fresh = await refetchCategories()
      list = fresh?.data ?? list
    }
    const existing = list.find((c) => c.name === name)
    if (existing) return existing.id
    const created = await addCategory({ name, color: '#8855cc' })
    return created?.id ?? null
  }, [categories, categoriesLoading, refetchCategories, addCategory])

  /* Record that the money actually went in. Returns the investments row. */
  const recordInvestment = useCallback(async ({ amount, investedOn, note } = {}) => {
    /* Whole shekels. The caller's figure is a raw percentage of a raw total
       (33% of ₪380 = 125.4), while isr() rounds for display — so without this
       the user presses a button reading "₪125" and the ledger, נטו and the
       invested total each quietly file 125.4. Math.round matches isr exactly,
       so what was shown is what gets stored. */
    const value = Math.round(Number(amount) || 0)
    if (value <= 0) return null

    /* Resolved ONCE, here, and used for both rows. Letting each side fall back
       to its own default would date the expense and the record independently —
       and near midnight or a month boundary they'd disagree, which is exactly
       the bucket the widget reads. */
    const day = investedOn || localDateString()

    const category_id = await ensureCategory()
    const tx = await addTransaction({
      amount: value,
      type: 'expense',
      date: day,
      desc: i18n.t('finance:investment.txDesc'),
      category_id,
      status: 'confirmed',
    })

    try {
      const row = await insertInvestment({
        amount: value,
        invested_on: day,
        transaction_id: tx?.id ?? null,
        note: note || null,
      })
      qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
      return row
    } catch (e) {
      /* The expense landed but the record didn't. Leaving it would show an
         unexplained outgoing in the ledger that the widget also refuses to
         exclude (no link exists) — so it would wrongly shrink next month's
         target. Roll the transaction back rather than leave that behind. */
      if (tx?.id) await removeTransaction(tx.id).catch(() => {})
      showError(i18n.t('finance:investment.recordFailed'))
      throw e
    }
  }, [ensureCategory, addTransaction, removeTransaction, qc])

  /* Soft-delete the pair together — from the user's side "השקעתי" was one
     action, so undoing it is one action too. Both are restorable.

     This went a long time with no caller (the widget recorded money and never
     listed it), and two halves of that promise were never true in practice:
     the transaction was removed WITHOUT `silent`, so its own undo replaced
     this one (pushUndo is single-level) and the toast that survived restored
     only the transaction — while this undo restored only the investment. Both
     directions now move the pair. */
  const undoInvestment = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((r) => r.id === id)
    if (!row) return
    const txId = row.transaction_id || null
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id))
    try {
      await apiRemoveInvestment(id)
      if (txId) await removeTransaction(txId, { silent: true }).catch(() => {})
      pushUndo({
        label: i18n.t('finance:investment.undoLabel'),
        undo: async () => {
          try {
            await restoreInvestment(id)
            if (txId) await restoreTransaction(txId).catch(() => {})
          } finally {
            qc.invalidateQueries({ queryKey: KEY })
            qc.invalidateQueries({ queryKey: ['transactions'] })
          }
        },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id))
          try {
            await apiRemoveInvestment(id)
            if (txId) await removeTransaction(txId, { silent: true }).catch(() => {})
          } catch { revertWrite(qc, { queryKey: KEY }) }
        },
      })
    } catch { revertWrite(qc, { queryKey: KEY }) }
  }, [qc, removeTransaction])

  return {
    investments,
    loading: isLoading,
    error: error?.message ?? null,
    recordInvestment,
    undoInvestment,
    refetch,
  }
}
