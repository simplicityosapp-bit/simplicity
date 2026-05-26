/* ════════════════════════════════════════════════════════════════
   QUOTES API — read-only system table (admin-managed, shared pool).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

export async function listQuotes() {
  const { data, error } = await supabase.from('quotes').select('*')
  if (error) throw error
  return data
}
