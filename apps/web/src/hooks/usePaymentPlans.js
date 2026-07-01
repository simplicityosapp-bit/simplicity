import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listPaymentPlans, insertPaymentPlan, updatePaymentPlan, removePaymentPlan,
  listPaymentInstallments, insertPaymentInstallments, updatePaymentInstallment,
} from '../lib/api/paymentPlans'
import { insertTransaction, removeTransaction } from '../lib/api/transactions'
import { updateClient } from '../lib/api/clients'
import { generateInstallments, installmentDesc } from '@simplicity/core'
import { showError } from '../lib/toast'

/* ════════════════════════════════════════════════════════════════
   usePaymentPlans — split-payment plans + their installments, plus the
   orchestration that keeps the MONEY truth in the transactions ledger:
     • createPlan  → plan + N generated installments, and (by decision) the
       plan total becomes the client's total (total_override).
     • markReceived   → creates a linked income transaction, then flags the
       installment received + stores its method/date + transaction_id.
     • unmarkReceived → soft-deletes that transaction and clears the flags.
   Transactions/clients caches are invalidated so finance + the client card
   reflect the change immediately.
   ════════════════════════════════════════════════════════════════ */
const PLANS = ['payment_plans']
const INSTALLMENTS = ['payment_installments']

export function usePaymentPlans() {
  const qc = useQueryClient()
  const plansQ = useQuery({ queryKey: PLANS, queryFn: listPaymentPlans })
  const instQ = useQuery({ queryKey: INSTALLMENTS, queryFn: listPaymentInstallments })

  const refreshMoney = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['clients'] })
  }, [qc])

  /* Create a plan + its installments. Sets the client's total to the plan
     total so the client card's balance reflects the plan (decision: plan
     defines the total). */
  const createPlan = useCallback(async ({ client_id, project_id = null, total, count, startDate = null, notes = null }) => {
    const plan = await insertPaymentPlan({ client_id, project_id, total_amount: Number(total) || 0, num_installments: Math.max(1, Math.floor(Number(count) || 1)), notes })
    const rows = generateInstallments({ total, count, startDate }).map((r) => ({ ...r, plan_id: plan.id }))
    const installments = await insertPaymentInstallments(rows)
    qc.setQueryData(PLANS, (prev) => [plan, ...(prev ?? [])])
    qc.setQueryData(INSTALLMENTS, (prev) => [...(prev ?? []), ...installments])
    try { await updateClient(client_id, { total_override: Number(total) || 0, has_custom_price: true }) } catch { /* card total only — non-fatal */ }
    refreshMoney()
    return { plan, installments }
  }, [qc, refreshMoney])

  /* Mark an installment received: create the income transaction first (the
     money record), then link it onto the installment. If the transaction
     fails we DON'T flip the flag, so the ledger and the plan never diverge. */
  const markReceived = useCallback(async (inst, { plan, clientName, date, paymentMethod }) => {
    let tx = null
    try {
      tx = await insertTransaction({
        amount: Math.abs(Number(inst.amount) || 0),
        type: 'income',
        desc: installmentDesc(inst, plan, clientName),
        date: date || new Date().toISOString().slice(0, 10),
        status: 'confirmed',
        client_id: plan?.client_id || null,
        project_id: plan?.project_id || null,
        category_id: null,
        payment_method: paymentMethod || null,
        recurring_id: null,
        orphaned_from: null,
      })
      const row = await updatePaymentInstallment(inst.id, {
        received: true, received_date: tx.date, payment_method: paymentMethod || null, transaction_id: tx.id,
      })
      qc.setQueryData(INSTALLMENTS, (prev) => (prev ?? []).map((i) => (i.id === inst.id ? row : i)))
      refreshMoney()
      return row
    } catch (e) {
      /* The income tx was created but linking it to the installment failed:
         roll the tx back so the installment still shows unpaid and the next
         retry doesn't create a SECOND income transaction (double-counting). */
      if (tx?.id) { try { await removeTransaction(tx.id) } catch { /* best-effort */ } }
      showError('סימון התשלום נכשל — נסה/י שוב')
      throw e
    }
  }, [qc, refreshMoney])

  /* Undo a received installment: soft-delete its income transaction and
     clear the flags. */
  const unmarkReceived = useCallback(async (inst) => {
    try {
      if (inst.transaction_id) { try { await removeTransaction(inst.transaction_id) } catch { /* already gone */ } }
      const row = await updatePaymentInstallment(inst.id, { received: false, received_date: null, transaction_id: null })
      qc.setQueryData(INSTALLMENTS, (prev) => (prev ?? []).map((i) => (i.id === inst.id ? row : i)))
      refreshMoney()
      return row
    } catch (e) {
      showError('ביטול הסימון נכשל — נסה/י שוב')
      throw e
    }
  }, [qc, refreshMoney])

  /* Edit a single installment (amount / due date). */
  const editInstallment = useCallback(async (id, patch) => {
    const row = await updatePaymentInstallment(id, patch)
    qc.setQueryData(INSTALLMENTS, (prev) => (prev ?? []).map((i) => (i.id === id ? row : i)))
    return row
  }, [qc])

  /* Remove a plan (and its installments). Received installments keep their
     income transactions — that money really came in; only the schedule goes. */
  const removePlan = useCallback(async (planId) => {
    qc.setQueryData(PLANS, (prev) => (prev ?? []).filter((p) => p.id !== planId))
    qc.setQueryData(INSTALLMENTS, (prev) => (prev ?? []).filter((i) => i.plan_id !== planId))
    try { await removePaymentPlan(planId) } catch { qc.invalidateQueries({ queryKey: PLANS }); qc.invalidateQueries({ queryKey: INSTALLMENTS }) }
  }, [qc])

  const editPlan = useCallback(async (id, patch) => {
    const row = await updatePaymentPlan(id, patch)
    qc.setQueryData(PLANS, (prev) => (prev ?? []).map((p) => (p.id === id ? row : p)))
    return row
  }, [qc])

  return {
    plans: plansQ.data ?? [],
    installments: instQ.data ?? [],
    loading: plansQ.isLoading || instQ.isLoading,
    createPlan, markReceived, unmarkReceived, editInstallment, editPlan, removePlan,
  }
}
