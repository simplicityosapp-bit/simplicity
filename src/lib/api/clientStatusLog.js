/* ════════════════════════════════════════════════════════════════
   CLIENT STATUS LOG API — append-only audit trail of every
   status_meta transition on the clients table. Used by trend graphs
   (e.g. "active clients over time") and by the one-time seed that
   backfills an opening row for legacy clients.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

/* Insert a single transition row. `oldStatus` may be null (initial seed
   or first row). Throws on error — callers wanting fire-and-forget
   semantics should attach .catch(). */
export async function insertClientStatusLog({ clientId, oldStatus, newStatus, changedAt }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = {
    user_id: session.user.id,
    client_id: clientId,
    old_status: oldStatus ?? null,
    new_status: newStatus,
    changed_at: changedAt || new Date().toISOString(),
  }
  const { data, error } = await supabase.from('client_status_log').insert(row).select().single()
  if (error) throw error
  return data
}

/* All transitions for a client, oldest first (chronological). */
export async function listClientStatusLog(clientId) {
  const { data, error } = await supabase
    .from('client_status_log')
    .select('*')
    .eq('client_id', clientId)
    .order('changed_at', { ascending: true })
  if (error) throw error
  return data
}

/* All transitions in a date range across every client. Used by the
   "active clients over time" trend on the moon-glance drawer. */
export async function getClientStatusLogRange(fromISO, toISO) {
  let q = supabase.from('client_status_log').select('*').order('changed_at', { ascending: true })
  if (fromISO) q = q.gte('changed_at', fromISO)
  if (toISO) q = q.lte('changed_at', toISO)
  const { data, error } = await q
  if (error) throw error
  return data
}

/* Count log rows for a single client — used by the seed step to
   detect "client without any history". */
export async function countClientStatusLogRows(clientId) {
  const { count, error } = await supabase
    .from('client_status_log')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
  if (error) throw error
  return count || 0
}
