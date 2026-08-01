/* ════════════════════════════════════════════════════════════════
   INVESTMENTS API — Supabase data access (RLS-scoped to the user).
   investments (migration 0105). Owner-only; every write stamps user_id
   from the session.

   A row here is the user's own statement that money went into their
   investment pot. It normally links to the expense transaction that was
   created alongside it (transaction_id) — see hooks/useInvestments.js,
   which writes both together and rolls the pair back as one.
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

/* YYYY-MM-DD in LOCAL time (matches the DATE column semantics). Mirrors the
   helper in clientAdjustments.js. Exported because the investment and the
   expense it creates must be stamped with the SAME day — see useInvestments. */
export function localDateString(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export async function listInvestments() {
  return selectAllRows(() => supabase
    .from('investments')
    .select('*')
    .is('deleted_at', null)
    .order('invested_on', { ascending: false }))
}

export async function insertInvestment(input) {
  const row = sanitize(input)
  row.user_id = await userId()
  /* Stamped client-side rather than left to the column's DEFAULT CURRENT_DATE,
     which is UTC: an investment recorded in Israel after midnight would
     otherwise be filed under the previous day — and near a month boundary,
     under the previous MONTH, which is the bucket the widget reads. */
  if (!row.invested_on) row.invested_on = localDateString()
  const { data, error } = await supabase.from('investments').insert(row).select().single()
  if (error) throw error
  return data
}

/* Soft-delete, so an accidental "השקעתי" is recoverable from the same 30-day
   trash as everything else. */
export async function removeInvestment(id) {
  const { error } = await supabase
    .from('investments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreInvestment(id) {
  const { error } = await supabase
    .from('investments')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
}
