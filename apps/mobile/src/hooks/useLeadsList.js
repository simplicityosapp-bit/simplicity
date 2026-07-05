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

  return { leads, loading, error, refetch: load }
}
