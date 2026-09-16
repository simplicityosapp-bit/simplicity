import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { callInvoices } from '../lib/invoices'
import { showError } from '../lib/toast'
import i18n from '../lib/i18n'

/* Documents issued in the external invoicing service, staged by the webhook
   or the daily scan, waiting for the coach to record them as income (web
   useInvoiceImports). Approve creates the income transaction server-side;
   dismiss marks the staged row dismissed. The table is read-only to the
   client (RLS), so both go through the `invoices` function. */
export function useInvoiceImports({ onImported } = {}) {
  const [imports, setImports] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('pending_invoice_imports').select('*').eq('status', 'pending').order('created_at', { ascending: false })
      if (!error) setImports(data ?? [])
    } catch { /* no queue to show */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const drop = (id) => setImports((prev) => prev.filter((r) => r.id !== id))

  const approve = useCallback(async (id) => {
    try {
      await callInvoices('import-approve', { import_id: id })
      drop(id)
      onImported?.()
    } catch (e) {
      // Already handled elsewhere (the web app, another device) → just reconcile.
      if (e?.message === 'already_handled') { drop(id); onImported?.(); return }
      showError(i18n.t('components:errors.importFailed'))
      throw e
    }
  }, [onImported])

  const dismiss = useCallback(async (id) => {
    try {
      await callInvoices('import-dismiss', { import_id: id })
      drop(id)
    } catch (e) {
      showError(i18n.t('components:errors.actionFailed'))
      throw e
    }
  }, [])

  return { imports, loading, refetch: load, approve, dismiss }
}
