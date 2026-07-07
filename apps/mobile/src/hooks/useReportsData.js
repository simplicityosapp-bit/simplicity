import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// The seven tables the reports engine (core computeReportForRange) needs. Loaded
// raw — core's live() filters soft-deleted rows, and this avoids a missing
// deleted_at column erroring on relation tables (group_members).
const EMPTY = { leads: [], clients: [], sessions: [], transactions: [], tasks: [], groupMembers: [], groups: [] }
const TABLES = { leads: 'leads', clients: 'clients', sessions: 'sessions', transactions: 'transactions', tasks: 'tasks', groupMembers: 'group_members', groups: 'groups' }

async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select('*').limit(2000)
  if (error) throw error
  return data ?? []
}

export function useReportsData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const keys = Object.keys(TABLES)
      const rows = await Promise.all(keys.map((k) => fetchTable(TABLES[k])))
      setState(Object.fromEntries(keys.map((k, i) => [k, rows[i]])))
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, loading, error, refetch: load }
}
