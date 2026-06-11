/* ════════════════════════════════════════════════════════════════
   QUOTES API — read-only system table (admin-managed, shared pool).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

export async function listQuotes() {
  return selectAllRows(() => supabase.from('quotes').select('*'))
}
