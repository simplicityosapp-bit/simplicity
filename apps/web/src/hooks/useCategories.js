import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listCategories, insertCategory,
  updateCategory as apiUpdateCategory,
  removeCategory as apiRemoveCategory, restoreCategory,
} from '../lib/api/categories'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'

/* React-Query-backed: shared across meeting-confirm + chips widgets + finance. Public API unchanged. */
const KEY = ['categories']

export function useCategories() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listCategories })
  const categories = data ?? []

  const addCategory = useCallback(async (payload) => {
    const row = await insertCategory(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row])
    return row
  }, [qc])

  const updateCategory = useCallback(async (id, patch) => {
    const row = await apiUpdateCategory(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((c) => (c.id === id ? row : c)))
    return row
  }, [qc])

  const removeCategory = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((c) => c.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((c) => c.id !== id))
    try {
      await apiRemoveCategory(id)
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.category'), restoreFn: restoreCategory, deleteFn: apiRemoveCategory })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { categories, loading: isLoading, error: error?.message ?? null, addCategory, updateCategory, removeCategory, refetch }
}
