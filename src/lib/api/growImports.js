import { supabase } from '../supabase'

/* Pending Grow charge-imports the coach hasn't acted on yet. Client-readable
   own rows (RLS); grow-poll stages them and the `grow` function approves /
   dismisses (service role). */
export async function listPendingGrowImports() {
  const { data, error } = await supabase
    .from('pending_grow_imports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
