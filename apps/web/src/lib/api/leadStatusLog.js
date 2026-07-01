/* ════════════════════════════════════════════════════════════════
   LEAD STATUS LOG API — append-only audit trail of every status_id
   transition on the leads table. D24. Used by trend reports
   ("conversions over time", "leads stuck in process") and by the
   one-time seed that backfills an opening row for legacy leads.

   Note: lead_status_log references lead_statuses(id) (sub-status FK),
   not the 4-meta enum. A lead must have a non-null status_id to be
   logged — callers should skip the write if status_id is missing.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

/* Valid `source` values per schema check constraint. */
export const LEAD_STATUS_LOG_SOURCES = ['manual_drag', 'manual_select', 'converted', 'auto_expire']

/* Insert a single transition row. `fromStatusId` may be null (initial
   seed). `toStatusId` is required and must reference an existing
   lead_statuses row. Throws on error. */
export async function insertLeadStatusLog({ leadId, fromStatusId, toStatusId, changedAt, source }) {
  if (!toStatusId) throw new Error('insertLeadStatusLog: toStatusId is required')
  if (!LEAD_STATUS_LOG_SOURCES.includes(source)) {
    throw new Error(`insertLeadStatusLog: invalid source "${source}"`)
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = {
    user_id: session.user.id,
    lead_id: leadId,
    from_status_id: fromStatusId ?? null,
    to_status_id: toStatusId,
    changed_at: changedAt || new Date().toISOString(),
    source,
  }
  const { data, error } = await supabase.from('lead_status_log').insert(row).select().single()
  if (error) throw error
  return data
}

/* All transitions for a single lead, oldest first. */
export async function listLeadStatusLog(leadId) {
  return selectAllRows(() => supabase
    .from('lead_status_log')
    .select('*')
    .eq('lead_id', leadId)
    .order('changed_at', { ascending: true }))
}

/* All transitions in a date range, across every lead. */
export async function getLeadStatusLogRange(fromISO, toISO) {
  return selectAllRows(() => {
    let q = supabase.from('lead_status_log').select('*').order('changed_at', { ascending: true })
    if (fromISO) q = q.gte('changed_at', fromISO)
    if (toISO) q = q.lte('changed_at', toISO)
    return q
  })
}

/* Count log rows for a single lead — used by the seed step. */
export async function countLeadStatusLogRows(leadId) {
  const { count, error } = await supabase
    .from('lead_status_log')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId)
  if (error) throw error
  return count || 0
}
