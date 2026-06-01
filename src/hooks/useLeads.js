import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listLeads, insertLead, updateLead as apiUpdateLead, removeLead as apiRemoveLead } from '../lib/api/leads'

/* React-Query-backed: shared cache across screens. Public API unchanged. */
const KEY = ['leads']

export function useLeads() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listLeads })
  const leads = data ?? []

  const addLead = useCallback(async (payload) => {
    const row = await insertLead(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updateLead = useCallback(async (id, patch, opts) => {
    const row = await apiUpdateLead(id, patch, opts)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((l) => (l.id === id ? row : l)))
    return row
  }, [qc])

  const removeLead = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((l) => l.id !== id))
    try { await apiRemoveLead(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { leads, loading: isLoading, error: error?.message ?? null, addLead, updateLead, removeLead, refetch }
}
