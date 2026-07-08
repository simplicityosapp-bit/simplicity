import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const LOG_SOURCES = ['manual_drag', 'manual_select', 'converted', 'auto_expire']

// Record a sub-status transition in lead_status_log (mirrors web's
// insertLeadStatusLog) — this is how the system tracks a lead's progression.
// to_status_id is required (the table FKs lead_statuses); a null target is
// skipped. Best-effort — never blocks the update.
async function logLeadStatus({ leadId, fromStatusId, toStatusId, source }) {
  if (!toStatusId || !LOG_SOURCES.includes(source)) return
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  await supabase.from('lead_status_log').insert({
    user_id: session.user.id,
    lead_id: leadId,
    from_status_id: fromStatusId ?? null,
    to_status_id: toStatusId,
    changed_at: new Date().toISOString(),
    source,
  })
}

// Keep closed_at consistent with status_meta (mirrors web lib/api/leads.js
// reconcileClosedAt). Only acts when the patch/insert touches status_meta:
// in_process → clear closed_at; converted/not_relevant → stamp it if absent.
// closed_at drives the shared Reports "leads closed" metric, so it must be
// maintained on the mobile write paths too.
function reconcileClosedAt(row) {
  if (row.status_meta === undefined) return row
  if (row.status_meta === 'in_process') return { ...row, closed_at: null }
  if (row.closed_at === undefined || row.closed_at === null) {
    return { ...row, closed_at: new Date().toISOString() }
  }
  return row
}

// Leads for the leads screen. Core statusMetaOfLead/metaTitle group + label them.
export function useLeadsList() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.from('leads').select('*').is('deleted_at', null).limit(2000)
      if (e) throw e
      setLeads(data ?? [])
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addLead = useCallback(async (payload, opts = {}) => {
    const source = opts.source || 'manual_select'
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const row = reconcileClosedAt({ ...payload })
    const { data, error: e } = await supabase.from('leads').insert({ ...row, user_id: session.user.id }).select().single()
    if (e) throw e
    setLeads((prev) => [data, ...prev])
    // Open the status log with the first entry — only when a sub-status was
    // picked (to_status_id is NOT NULL in the schema). Mirrors web insertLead.
    if (data?.id && data?.status_id) {
      logLeadStatus({ leadId: data.id, fromStatusId: null, toStatusId: data.status_id, source }).catch(() => {})
    }
    return data
  }, [])

  const updateLead = useCallback(async (id, patch, opts = {}) => {
    const source = opts.source || 'manual_select'
    // Keep closed_at in sync with any status_meta change before writing.
    const cleanPatch = reconcileClosedAt({ ...patch })
    // When the sub-status changes, capture the transition first (read old id).
    let oldStatusId
    if (cleanPatch.status_id !== undefined) {
      const prev = leads.find((l) => l.id === id)
      oldStatusId = prev?.status_id ?? null
    }
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...cleanPatch } : l))) // optimistic
    const { data, error: e } = await supabase.from('leads').update(cleanPatch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setLeads((prev) => prev.map((l) => (l.id === id ? data : l)))
    if (cleanPatch.status_id !== undefined && cleanPatch.status_id && cleanPatch.status_id !== oldStatusId) {
      logLeadStatus({ leadId: id, fromStatusId: oldStatusId, toStatusId: cleanPatch.status_id, source }).catch(() => {})
    }
    return data
  }, [load, leads])

  const deleteLead = useCallback(async (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id)) // optimistic remove
    const { error: e } = await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  // Lead → client conversion helpers (used by ConvertLeadModal).
  const addClient = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('clients').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    return data
  }, [])

  const addGroupMember = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    const { data, error: e } = await supabase.from('group_members').insert({ ...payload, user_id: session.user.id }).select().single()
    if (e) throw e
    return data
  }, [])

  return { leads, loading, error, refetch: load, addLead, updateLead, deleteLead, addClient, addGroupMember }
}
