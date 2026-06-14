import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { callInvoices } from '../lib/api/integrations'

/* Client over the `invoices` edge function. Unlike Google Calendar there is
   no OAuth redirect — the user pastes their provider API key + secret and we
   POST them to the function, which validates by minting a token server-side.
   Status never includes the key/secret (the browser can't read them at all).

   Status + catalog are read through React Query so they're fetched ONCE and
   shared across every mount: InvoiceCard (connections) and every InvoiceActions
   instance (one per edit-transaction modal) read the same cached status instead
   of each firing its own round-trip. Connect/test/disconnect/auto-import write
   the fresh status straight back into the cache, so a just-connected provider
   immediately enables "הפק חשבונית" everywhere. */
const STATUS_KEY = ['invoice_status']
const CATALOG_KEY = ['invoice_catalog']

export function useInvoiceProvider() {
  const qc = useQueryClient()
  const { data: status = null, isLoading: loading, error: queryError } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => callInvoices('status').then((r) => r.status),
  })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const setStatus = useCallback((s) => qc.setQueryData(STATUS_KEY, s), [qc])

  const loadStatus = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: STATUS_KEY })
  }, [qc])

  /* Connect (and validate) a provider. creds: { provider, apiKey, apiSecret,
     environment }. Throws on failure (the caller shows the mapped message). */
  const connect = useCallback(async ({ provider, apiKey, apiSecret, environment }) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('connect', {
        provider,
        api_key: apiKey,
        api_secret: apiSecret,
        environment,
      })
      setStatus(r.status)
      qc.removeQueries({ queryKey: CATALOG_KEY }) // new connection → its catalog may differ
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [qc, setStatus])

  /* Re-validate the stored credentials (mints a fresh token server-side). */
  const test = useCallback(async () => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('test')
      if (r.status) setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  const disconnect = useCallback(async () => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('disconnect')
      setStatus(r.status)
      qc.removeQueries({ queryKey: CATALOG_KEY })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }, [qc, setStatus])

  /* Issue a real document for an income transaction. Returns { document }.
     The caller (InvoiceActions) tracks its own busy/error state. */
  const issueDocument = useCallback(async (transactionId, docType, opts = {}) => {
    return callInvoices('issue', {
      transaction_id: transactionId,
      doc_type: docType,
      item_name: opts.itemName,
      item_id: opts.itemId,
      payment_method: opts.paymentMethod,
    })
  }, [])

  /* The connected provider's product/service catalog (for the issuance picker),
     cached for the session — re-opening the picker (same or another transaction)
     resolves from cache instead of re-fetching every time. */
  const loadItems = useCallback(() => qc.fetchQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => callInvoices('catalog').then((r) => r?.items ?? []),
  }), [qc])

  /* Toggle auto-import (Route B: stage vs. record incoming docs without asking). */
  const setAutoImport = useCallback(async (value) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('set-auto-import', { value: !!value })
      if (r?.status) setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  return {
    status,
    loading,
    busy,
    error: actionError ?? (queryError?.message ?? null),
    connect,
    test,
    disconnect,
    loadStatus,
    issueDocument,
    loadItems,
    setAutoImport,
  }
}
