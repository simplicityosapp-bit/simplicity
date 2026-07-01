import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listLeads, insertLead, updateLead as apiUpdateLead, removeLead as apiRemoveLead, restoreLead } from '../lib/api/leads'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'

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
    const row = (qc.getQueryData(KEY) ?? []).find((l) => l.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((l) => l.id !== id))
    try {
      await apiRemoveLead(id)
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.lead'), restoreFn: restoreLead, deleteFn: apiRemoveLead })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { leads, loading: isLoading, error: error?.message ?? null, addLead, updateLead, removeLead, refetch }
}
