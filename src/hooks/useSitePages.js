import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listSitePages, insertSitePage, updateSitePage as apiUpdate,
  removeSitePage as apiRemove, restoreSitePage,
} from '../lib/api/sitePages'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '../i18n'

/* React-Query-backed: shared cache across the hub + editor. Mirrors
   useLeadPages / useBookingPages. One cache holds all kinds; the hub filters
   client-side by kind. */
const KEY = ['sitePages']

export function useSitePages() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: () => listSitePages() })
  const pages = data ?? []

  const addPage = useCallback(async (payload) => {
    const row = await insertSitePage(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updatePage = useCallback(async (id, patch) => {
    const row = await apiUpdate(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((p) => (p.id === id ? row : p)))
    return row
  }, [qc])

  const removePage = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((p) => p.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((p) => p.id !== id))
    try {
      await apiRemove(id)
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.sitePage'), restoreFn: restoreSitePage, deleteFn: apiRemove })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { pages, loading: isLoading, error: error?.message ?? null, addPage, updatePage, removePage, refetch }
}
