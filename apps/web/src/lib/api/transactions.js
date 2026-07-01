/* ════════════════════════════════════════════════════════════════
   TRANSACTIONS API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* Reject NaN/Infinity/negative/absurd amounts before they reach the DB and
   poison finance aggregates and exported reports. The React modal validates
   too, but PostgREST + the anon key mean the UI is not a trust boundary, and
   the `amount` column has no DB CHECK. Coerce-and-check only; never mutate. */
const MAX_AMOUNT = 1e12
function assertValidAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
    throw new Error('סכום לא תקין')
  }
}

export async function listTransactions() {
  return selectAllRows(() => supabase
    .from('transactions')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false }))
}

export async function insertTransaction(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  assertValidAmount(row.amount)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('transactions').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateTransaction(id, patch) {
  const clean = sanitize(patch)
  if ('amount' in clean) assertValidAmount(clean.amount)
  const { data, error } = await supabase.from('transactions').update(clean).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function removeTransaction(id) {
  const { error } = await supabase.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listDeletedTransactions() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return selectAllRows(() => supabase
    .from('transactions')
    .select('*')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false }))
}

export async function restoreTransaction(id) {
  const { data, error } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
