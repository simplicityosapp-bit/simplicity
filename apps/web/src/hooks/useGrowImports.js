import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listPendingGrowImports } from '../lib/api/growImports'
import { callGrow } from '../lib/api/integrations'
import { showError } from '../lib/toast'
import i18n from '@simplicity/core/i18n'

/* Pending external-charge imports from grow-poll. Approve creates an income
   transaction server-side (the `grow` function, tagged grow_transaction_id);
   dismiss marks the staged row dismissed. Mirrors useInvoiceImports. */
const KEY = ['pending_grow_imports']

export function useGrowImports() {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({ queryKey: KEY, queryFn: listPendingGrowImports })
  const imports = data ?? []
  const drop = useCallback((id) => qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id)), [qc])

  const approve = useCallback(async (id) => {
    try {
      await callGrow('import-approve', { import_id: id })
      drop(id)
      qc.invalidateQueries({ queryKey: ['transactions'] }) // the new income transaction
    } catch (e) {
      if (e?.message === 'already_handled') drop(id)
      else showError(i18n.t('components:errors.importFailed'))
      throw e
    }
  }, [qc, drop])

  const dismiss = useCallback(async (id) => {
    try {
      await callGrow('import-dismiss', { import_id: id })
      drop(id)
    } catch (e) {
      showError(i18n.t('components:errors.actionFailed'))
      throw e
    }
  }, [drop])

  return { imports, loading: isLoading, refetch, approve, dismiss }
}
