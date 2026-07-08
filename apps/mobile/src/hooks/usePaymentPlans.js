import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { generateInstallments, installmentDesc } from '@simplicity/core'

// Split-payment plans (פריסת תשלומים) + their installments, ported from web's
// usePaymentPlans. Self-contained (loads its own tables) so the drawer section
// stays a drop-in. The MONEY truth lives in the transactions ledger: marking an
// installment received creates a linked income transaction FIRST, then flags the
// installment — if the transaction fails we don't flip the flag, so the ledger
// and the plan never diverge. Mobile has no react-query, so this uses supabase +
// useState like the other data hooks; callers filter to one client in JS
// (planInstallments / plans.find) exactly like web.
async function currentUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id || null
}

export function usePaymentPlans() {
  const [plans, setPlans] = useState([])
  const [installments, setInstallments] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: p }, { data: i }] = await Promise.all([
        supabase.from('payment_plans').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('payment_installments').select('*').is('deleted_at', null),
      ])
      setPlans(p ?? [])
      setInstallments(i ?? [])
    } catch { /* keep last-known */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refetch() }, [refetch])

  // Create a plan + its installments. Sets the client's total to the plan total
  // so the client card's balance reflects the plan (decision: plan defines total).
  const createPlan = useCallback(async ({ client_id, project_id = null, total, count, startDate = null, notes = null }) => {
    const uid = await currentUserId()
    const { data: plan, error } = await supabase.from('payment_plans').insert({
      user_id: uid, client_id, project_id,
      total_amount: Number(total) || 0,
      num_installments: Math.max(1, Math.floor(Number(count) || 1)),
      notes,
    }).select().single()
    if (error) throw error
    const rows = generateInstallments({ total, count, startDate }).map((r) => ({ ...r, plan_id: plan.id, user_id: uid }))
    // Installments MUST succeed before we set the client total — otherwise the
    // client gets an inflated total_override with no installments to pay it
    // down (unpayable, corrupted balance). Mirrors web, which awaits a throwing
    // insertPaymentInstallments() before the updateClient total_override.
    const { data: created, error: instErr } = await supabase.from('payment_installments').insert(rows).select()
    if (instErr) throw instErr
    setPlans((prev) => [plan, ...prev])
    setInstallments((prev) => [...prev, ...(created ?? [])])
    try { await supabase.from('clients').update({ total_override: Number(total) || 0, has_custom_price: true }).eq('id', client_id) } catch { /* card total only — non-fatal */ }
    return { plan, installments: created }
  }, [])

  // Mark received: create the income transaction first, then link it onto the
  // installment. On failure, roll the transaction back so a retry can't
  // double-count.
  const markReceived = useCallback(async (inst, { plan, clientName, date, paymentMethod }) => {
    let tx = null
    try {
      const uid = await currentUserId()
      const { data, error } = await supabase.from('transactions').insert({
        user_id: uid,
        amount: Math.abs(Number(inst.amount) || 0),
        type: 'income',
        desc: installmentDesc(inst, plan, clientName),
        date: date || new Date().toISOString().slice(0, 10),
        status: 'confirmed',
        client_id: plan?.client_id || null,
        project_id: plan?.project_id || null,
        category_id: null,
        payment_method: paymentMethod || null,
      }).select().single()
      if (error) throw error
      tx = data
      const { data: row, error: upErr } = await supabase.from('payment_installments')
        .update({ received: true, received_date: tx.date, payment_method: paymentMethod || null, transaction_id: tx.id })
        .eq('id', inst.id).select().single()
      if (upErr) throw upErr
      setInstallments((prev) => prev.map((i) => (i.id === inst.id ? row : i)))
      return row
    } catch (e) {
      if (tx?.id) { try { await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', tx.id) } catch { /* best-effort */ } }
      throw e
    }
  }, [])

  // Undo a received installment: soft-delete its income transaction, clear flags.
  const unmarkReceived = useCallback(async (inst) => {
    if (inst.transaction_id) { try { await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', inst.transaction_id) } catch { /* already gone */ } }
    const { data: row } = await supabase.from('payment_installments')
      .update({ received: false, received_date: null, transaction_id: null }).eq('id', inst.id).select().single()
    setInstallments((prev) => prev.map((i) => (i.id === inst.id ? (row || { ...i, received: false, received_date: null, transaction_id: null }) : i)))
    return row
  }, [])

  // Remove a plan (+ its installments). Received installments keep their income
  // transactions — that money really came in; only the schedule goes.
  const removePlan = useCallback(async (planId) => {
    setPlans((prev) => prev.filter((p) => p.id !== planId))
    setInstallments((prev) => prev.filter((i) => i.plan_id !== planId))
    const stamp = new Date().toISOString()
    try {
      await supabase.from('payment_plans').update({ deleted_at: stamp }).eq('id', planId)
      await supabase.from('payment_installments').update({ deleted_at: stamp }).eq('plan_id', planId)
    } catch { /* optimistic already applied */ }
  }, [])

  return { plans, installments, loading, createPlan, markReceived, unmarkReceived, removePlan }
}
