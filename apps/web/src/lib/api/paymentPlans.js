/* ════════════════════════════════════════════════════════════════
   PAYMENT PLANS API — Supabase data access (RLS-scoped to the user).
   payment_plans + payment_installments (migration 0056). Both tables are
   owner-only; every write stamps user_id from the session.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

async function userId() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  return session.user.id
}

/* ── plans ── */
export async function listPaymentPlans() {
  return selectAllRows(() => supabase
    .from('payment_plans')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
}

export async function insertPaymentPlan(input) {
  const row = sanitize(input)
  row.user_id = await userId()
  const { data, error } = await supabase.from('payment_plans').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updatePaymentPlan(id, patch) {
  const { data, error } = await supabase.from('payment_plans').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removePaymentPlan(id) {
  const stamp = new Date().toISOString()
  /* Soft-delete the plan AND its installments together, so a removed plan
     never leaves orphan installments behind in the cache or reports. */
  const { error } = await supabase.from('payment_plans').update({ deleted_at: stamp }).eq('id', id)
  if (error) throw error
  const { error: instErr } = await supabase.from('payment_installments').update({ deleted_at: stamp }).eq('plan_id', id)
  if (instErr) throw instErr
}

/* ── installments ── */
export async function listPaymentInstallments() {
  return selectAllRows(() => supabase
    .from('payment_installments')
    .select('*')
    .is('deleted_at', null)
    .order('num', { ascending: true }))
}

export async function insertPaymentInstallments(rows) {
  const uid = await userId()
  const payload = (rows || []).map((r) => ({ ...sanitize(r), user_id: uid }))
  if (!payload.length) return []
  const { data, error } = await supabase.from('payment_installments').insert(payload).select()
  if (error) throw error
  return data
}

export async function updatePaymentInstallment(id, patch) {
  const { data, error } = await supabase.from('payment_installments').update(sanitize(patch)).eq('id', id).select().single()
  if (error) throw error
  return data
}
