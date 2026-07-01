/* ════════════════════════════════════════════════════════════════
   USER QUOTES API — personal quotes pool (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   Complements the read-only system `quotes` table (migration 0013).
   The home quote widget draws from here when the user switches the
   source to "שלי" (prefs.quoteSource === 'personal').
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

export async function listUserQuotes() {
  return selectAllRows(() => supabase
    .from('user_quotes')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
}

export async function insertUserQuote(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('user_quotes').insert(row).select().single()
  if (error) throw error
  return data
}

export async function removeUserQuote(id) {
  const { error } = await supabase.from('user_quotes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

/* Soft-delete restore — used by undo. */
export async function restoreUserQuote(id) {
  const { error } = await supabase.from('user_quotes').update({ deleted_at: null }).eq('id', id)
  if (error) throw error
}
