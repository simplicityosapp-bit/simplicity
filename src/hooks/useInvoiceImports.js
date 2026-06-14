import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listPendingInvoiceImports } from '../lib/api/invoiceImports'
import { callInvoices } from '../lib/api/integrations'

/* Route-B pending imports. Approve creates an income transaction server-side
   (the `invoices` function); dismiss marks the staged row dismissed. */
const KEY = ['pending_invoice_imports']

export function useInvoiceImports() {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({ queryKey: KEY, queryFn: listPendingInvoiceImports })
  const imports = data ?? []

  const approve = useCallback(async (id) => {
    await callInvoices('import-approve', { import_id: id })
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id))
    qc.invalidateQueries({ queryKey: ['transactions'] }) // the new income transaction
  }, [qc])

  const dismiss = useCallback(async (id) => {
    await callInvoices('import-dismiss', { import_id: id })
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((r) => r.id !== id))
  }, [qc])

  return { imports, loading: isLoading, refetch, approve, dismiss }
}
