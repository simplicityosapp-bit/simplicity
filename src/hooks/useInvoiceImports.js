import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listPendingInvoiceImports } from '../lib/api/invoiceImports'
import { callInvoices } from '../lib/api/integrations'
import { showError } from '../lib/toast'

/* Route-B pending imports. Approve creates an income transaction server-side
   (the `invoices` function); dismiss marks the staged row dismissed. */
const KEY = ['pending_invoice_imports']

export function useInvoiceImports() {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({ queryKey: KEY, queryFn: listPendingInvoiceImports })
  const imports = data ?? []
  const drop = (id) => qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id))

  const approve = useCallback(async (id) => {
    try {
      await callInvoices('import-approve', { import_id: id })
      drop(id)
      qc.invalidateQueries({ queryKey: ['transactions'] }) // the new income transaction
    } catch (e) {
      // Already handled elsewhere → just reconcile; otherwise surface the failure.
      if (e?.message === 'already_handled') drop(id)
      else showError('הייבוא נכשל — נסה/י שוב')
      throw e
    }
  }, [qc])

  const dismiss = useCallback(async (id) => {
    try {
      await callInvoices('import-dismiss', { import_id: id })
      drop(id)
    } catch (e) {
      showError('הפעולה נכשלה — נסה/י שוב')
      throw e
    }
  }, [qc])

  return { imports, loading: isLoading, refetch, approve, dismiss }
}
