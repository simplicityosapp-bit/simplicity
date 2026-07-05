import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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

  const updateLead = useCallback(async (id, patch) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))) // optimistic
    const { data, error: e } = await supabase.from('leads').update(patch).eq('id', id).select().single()
    if (e) { load(); throw e }
    setLeads((prev) => prev.map((l) => (l.id === id ? data : l)))
    return data
  }, [load])

  const deleteLead = useCallback(async (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id)) // optimistic remove
    const { error: e } = await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (e) { load(); throw e }
  }, [load])

  return { leads, loading, error, refetch: load, updateLead, deleteLead }
}
