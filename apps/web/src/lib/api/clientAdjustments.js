/* ════════════════════════════════════════════════════════════════
   CLIENT ADJUSTMENTS API — Supabase data access (RLS-scoped to the user).
   client_adjustments (migration 0095). Owner-only; every write stamps
   user_id from the session.

   This table EXPLAINS clients.paid_adjustment / balance_adjustment — it
   does not replace them. Those columns stay the source of truth that
   clientBalance() reads, so callers must update the scalar and append a
   row here together (see hooks/useClientAdjustments.js, which does both).
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

export async function listClientAdjustments() {
  return selectAllRows(() => supabase
    .from('client_adjustments')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
}

/* YYYY-MM-DD in LOCAL time (matches the DATE column semantics). Mirrors the
   helper in moonSnapshots.js. */
function localDateString(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export async function insertClientAdjustment(input) {
  const row = sanitize(input)
  row.user_id = await userId()
  /* Stamped client-side rather than left to the column's DEFAULT CURRENT_DATE,
     which is UTC: an adjustment recorded in Israel after midnight would
     otherwise be filed under the previous day. */
  if (!row.occurred_on) row.occurred_on = localDateString()
  const { data, error } = await supabase.from('client_adjustments').insert(row).select().single()
  if (error) throw error
  return data
}

/* Soft-delete, so an adjustment removed by mistake is recoverable and the
   row keeps explaining history rather than vanishing from it. */
export async function removeClientAdjustment(id) {
  const { error } = await supabase
    .from('client_adjustments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/* Undo's counterpart — without it a redo restored the number but left the row
   soft-deleted, landing back on the bare unexplained figure this table exists
   to eliminate. */
export async function restoreClientAdjustment(id) {
  const { error } = await supabase
    .from('client_adjustments')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
}

/* One client column, straight from the DB. Used to base an increment on the
   stored value instead of a possibly-stale React prop. */
export async function getClientScalar(clientId, column) {
  const { data, error } = await supabase
    .from('clients')
    .select(column)
    .eq('id', clientId)
    .single()
  if (error) throw error
  return data?.[column]
}
